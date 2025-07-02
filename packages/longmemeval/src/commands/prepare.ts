import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { MockLanguageModelV1 } from '../test-utils/mock-model';
import { openai } from '@ai-sdk/openai';
import chalk from 'chalk';
import ora from 'ora';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

import { DatasetLoader } from '../data/loader';
import { BenchmarkStore, BenchmarkVectorStore } from '../storage';
import type { LongMemEvalQuestion, MemoryConfigOptions } from '../data/types';
import type { CoreMessage } from 'ai';

export interface PrepareOptions {
  dataset: 'longmemeval_s' | 'longmemeval_m' | 'longmemeval_oracle';
  memoryConfig: 'full-history' | 'last-k' | 'semantic-recall' | 'working-memory' | 'combined';
  outputDir?: string;
  subset?: number;
}

export class PrepareCommand {
  private loader: DatasetLoader;
  private baseDir: string;

  constructor() {
    this.loader = new DatasetLoader();
    this.baseDir = './prepared-data';
  }

  async run(options: PrepareOptions): Promise<void> {
    console.log(chalk.blue('\n🔧 Preparing LongMemEval Data\n'));

    // Load dataset
    const spinner = ora('Loading dataset...').start();
    const questions = await this.loader.loadDataset(options.dataset);
    spinner.succeed(`Loaded ${questions.length} questions`);

    // Apply subset if requested
    const questionsToProcess = options.subset ? questions.slice(0, options.subset) : questions;

    console.log(chalk.yellow(`\nProcessing ${questionsToProcess.length} questions\n`));

    // Create mock model for preparation
    const mockModel = new MockLanguageModelV1({
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
      }),
    });

    // Get memory configuration
    const memoryOptions = this.getMemoryOptions(options.memoryConfig);

    // Process each question
    for (let i = 0; i < questionsToProcess.length; i++) {
      const question = questionsToProcess[i];

      // Check if already prepared
      const questionDir = join(
        options.outputDir || this.baseDir,
        options.dataset,
        options.memoryConfig,
        question.question_id,
      );

      if (existsSync(join(questionDir, 'meta.json'))) {
        const spinner = ora(`Question ${i + 1}/${questionsToProcess.length}: ${question.question_id} (cached)`).start();
        spinner.succeed();
        continue;
      }

      const questionSpinner = ora(
        `Processing question ${i + 1}/${questionsToProcess.length}: ${question.question_id}`,
      ).start();

      await this.processQuestion(question, options, mockModel, memoryOptions, questionSpinner);
      questionSpinner.succeed(
        `Processed question ${question.question_id} (${question.haystack_sessions.length} sessions)`,
      );
    }

    console.log(chalk.green('\n✅ Data preparation complete!\n'));
    console.log(chalk.gray(`Prepared data saved to: ${this.baseDir}/${options.dataset}/${options.memoryConfig}/`));
  }

  private async processQuestion(
    question: LongMemEvalQuestion,
    options: PrepareOptions,
    mockModel: any,
    memoryOptions: MemoryConfigOptions,
    parentSpinner: any,
  ): Promise<void> {
    // Create fresh storage instances for this question
    const benchmarkStore = new BenchmarkStore();
    const benchmarkVectorStore = new BenchmarkVectorStore();

    // Initialize stores
    await benchmarkStore.init();

    // Create vector index if using semantic recall
    if (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined') {
      await benchmarkVectorStore.createIndex({
        indexName: 'messages',
        dimension: 1536, // text-embedding-3-small dimension
        metric: 'cosine',
      });
    }

    // Create memory with appropriate configuration
    const memory = new Memory({
      storage: benchmarkStore,
      vector:
        options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined'
          ? benchmarkVectorStore
          : undefined,
      embedder:
        options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined'
          ? openai.embedding('text-embedding-3-small')
          : undefined,
      options: memoryOptions.options,
    });

    // Create mock agent
    const mockAgent = new Agent({
      name: 'mock-prep-agent',
      instructions: 'Process and store conversation history',
      model: mockModel,
      memory: memory,
    });

    // Process all haystack sessions
    const resourceId = `resource_${question.question_id}`;

    // Process sessions in batches to avoid overwhelming the system
    const BATCH_SIZE = 20; // Process x sessions at a time
    let processedSessions = 0;

    for (let i = 0; i < question.haystack_sessions.length; i += BATCH_SIZE) {
      const sessionBatch = question.haystack_sessions.slice(i, i + BATCH_SIZE);
      const sessionIdBatch = question.haystack_session_ids.slice(i, i + BATCH_SIZE);

      // Update spinner with progress
      parentSpinner.text = `Processing question: ${question.question_id} (${processedSessions}/${question.haystack_sessions.length} sessions)`;

      // Process batch in parallel
      const batchPromises = sessionBatch.map(async (session, batchIdx) => {
        const sessionId = sessionIdBatch[batchIdx];

        // Convert session to messages
        const messages: CoreMessage[] = [];
        for (const turn of session) {
          if (!turn.content) continue;

          const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : 'user';
          messages.push({
            role,
            content: turn.content,
          });
        }

        if (messages.length > 0) {
          // Process through agent to save to memory
          await mockAgent.generate(messages, {
            threadId: sessionId, // Use haystack session ID as thread ID
            resourceId,
            memoryOptions: memoryOptions.options,
          });
        }
      });

      await Promise.all(batchPromises);
      processedSessions += sessionBatch.length;

      // Update progress after batch completes
      parentSpinner.text = `Processing question: ${question.question_id} (${processedSessions}/${question.haystack_sessions.length} sessions)`;
    }

    // Update status to saving
    parentSpinner.text = `Saving question data: ${question.question_id}`;

    // Create output directory
    const questionDir = join(
      options.outputDir || this.baseDir,
      options.dataset,
      options.memoryConfig,
      question.question_id,
    );
    await mkdir(questionDir, { recursive: true });

    // Persist storage
    await benchmarkStore.persist(join(questionDir, 'db.json'));

    // Persist vector store if used
    if (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined') {
      await benchmarkVectorStore.persist(join(questionDir, 'vector.json'));
    }

    // Save metadata
    const metadata = {
      questionId: question.question_id,
      questionType: question.question_type,
      question: question.question,
      answer: question.answer,
      resourceId,
      threadIds: question.haystack_session_ids,
      preparedAt: new Date().toISOString(),
      memoryConfig: options.memoryConfig,
      sessionCount: question.haystack_sessions.length,
      evidenceSessionIds: question.answer_session_ids,
    };

    await writeFile(join(questionDir, 'meta.json'), JSON.stringify(metadata, null, 2));
  }

  private getMemoryOptions(memoryConfig: string): MemoryConfigOptions {
    switch (memoryConfig) {
      case 'full-history':
        return {
          type: 'full-history',
          options: {
            lastMessages: 999999,
            semanticRecall: false,
            workingMemory: {
              enabled: false,
            },
          },
        };

      case 'last-k':
        return {
          type: 'last-k',
          options: {
            lastMessages: 50,
            semanticRecall: false,
            workingMemory: {
              enabled: false,
            },
          },
        };

      case 'semantic-recall':
        return {
          type: 'semantic-recall',
          options: {
            lastMessages: 10,
            semanticRecall: {
              topK: 10,
              messageRange: 2,
              scope: 'resource',
            },
            workingMemory: {
              enabled: false,
            },
          },
        };

      case 'working-memory':
        return {
          type: 'working-memory',
          options: {
            lastMessages: 10,
            semanticRecall: false,
            workingMemory: {
              enabled: true,
              template: `# User Context
- Name:
- Preferences:
- Current Task:
- Important Details:`,
            },
          },
        };

      case 'combined':
        return {
          type: 'combined',
          options: {
            lastMessages: 20,
            semanticRecall: {
              topK: 5,
              messageRange: 1,
              scope: 'resource',
            },
            workingMemory: {
              enabled: true,
            },
          },
        };

      default:
        throw new Error(`Unknown memory config: ${memoryConfig}`);
    }
  }
}
