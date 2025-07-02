import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { MockLanguageModelV1 } from '../test-utils/mock-model';
import { openai } from '@ai-sdk/openai';
import chalk from 'chalk';
import ora from 'ora';
import { join } from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
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
  concurrency?: number;
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

    // Get memory configuration
    const memoryOptions = this.getMemoryOptions(options.memoryConfig);

    // Use real model for working memory, mock for others
    const needsRealModel = options.memoryConfig === 'working-memory' || options.memoryConfig === 'combined';

    if (needsRealModel && !process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for working memory preparation');
    }

    const model = needsRealModel
      ? openai('gpt-4o')
      : new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
          }),
        });

    // Track active questions progress
    const activeQuestions = new Map<number, { questionId: string; status: string }>();

    // Create main progress spinner
    const mainSpinner = ora('Starting data preparation...').start();

    let processedCount = 0;
    let cachedCount = 0;
    let completedCount = 0; // Total completed (processed + cached)
    let inProgressCount = 0; // Currently processing
    const startTime = Date.now();

    // Determine question batch size based on config
    const questionConcurrency = options.concurrency || 10; // Allow concurrency for all configs

    console.log(chalk.gray(`Question concurrency: ${questionConcurrency}`));

    // Warn about working memory concurrency
    if ((options.memoryConfig === 'working-memory' || options.memoryConfig === 'combined') && questionConcurrency > 1) {
      console.log(
        chalk.yellow(
          `⚠️  Note: Running working memory questions concurrently. Each question has its own resource scope.`,
        ),
      );
    }

    let lastText = ``;
    // Function to update progress display
    const updateProgress = () => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = elapsed > 0 ? completedCount / elapsed : 0;
      const remaining = rate > 0 ? Math.round((questionsToProcess.length - completedCount) / rate) : 0;

      // Build progress text with active questions
      let progressText = `Overall: ${completedCount}/${questionsToProcess.length} (${inProgressCount} in progress, ${cachedCount} cached, ~${remaining}s remaining)`;

      if (activeQuestions.size > 0) {
        progressText += '\n\nActive questions:';
        activeQuestions.forEach((info, index) => {
          progressText += `\n  [${index + 1}] ${info.questionId} - ${info.status}`;
        });
      }

      if (lastText !== progressText) {
        lastText = progressText;
        mainSpinner.text = progressText;
      }
    };

    // Process questions in batches
    for (let i = 0; i < questionsToProcess.length; i += questionConcurrency) {
      const questionBatch = questionsToProcess.slice(i, Math.min(i + questionConcurrency, questionsToProcess.length));

      // Process each question in the batch
      const batchPromises = questionBatch.map(async (question, batchIndex) => {
        const questionIndex = i + batchIndex;
        const slotIndex = batchIndex;

        // Check if already prepared
        const questionDir = join(
          options.outputDir || this.baseDir,
          options.dataset,
          options.memoryConfig,
          question.question_id,
        );

        if (existsSync(join(questionDir, 'meta.json'))) {
          cachedCount++;
          completedCount++;

          mainSpinner.clear();
          console.log(
            chalk.green(`✓`),
            chalk.blue(`${question.question_id}`),
            chalk.gray(`(${question.question_type})`),
            chalk.yellow(`[cached]`),
            chalk.gray(`- ${completedCount}/${questionsToProcess.length}`),
          );
          mainSpinner.render();

          // Update progress
          updateProgress();

          return;
        }

        // Mark as in progress
        inProgressCount++;
        activeQuestions.set(slotIndex, { questionId: question.question_id, status: 'Starting...' });
        updateProgress();

        await this.processQuestion(
          question,
          options,
          model,
          memoryOptions,
          mainSpinner,
          questionIndex + 1,
          questionsToProcess.length,
          questionConcurrency > 1, // Pass whether we're running concurrently
          slotIndex,
          activeQuestions,
        );

        // Mark as completed
        inProgressCount--;
        processedCount++;
        completedCount++;

        // Remove from active questions
        activeQuestions.delete(slotIndex);

        mainSpinner.clear();
        console.log(
          chalk.green(`✓`),
          chalk.blue(`${question.question_id}`),
          chalk.gray(`(${question.question_type})`),
          chalk.gray(`${question.haystack_sessions.length} sessions`),
          chalk.gray(`- ${completedCount}/${questionsToProcess.length}`),
        );
        mainSpinner.render();

        // Update progress
        updateProgress();
      });

      // Set up periodic progress updates while batch is processing
      const progressInterval = setInterval(updateProgress, 500); // Update every 500ms

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Clear the interval
      clearInterval(progressInterval);

      // Final update after batch completes
      updateProgress();
    }

    mainSpinner.succeed(`Prepared ${processedCount} questions (${cachedCount} from cache)`);
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.gray(`Total time: ${totalTime}s (${Math.round((processedCount / totalTime) * 60)} q/min)`));

    console.log(chalk.green('\n✅ Data preparation complete!\n'));
    console.log(chalk.gray(`Prepared data saved to: ${this.baseDir}/${options.dataset}/${options.memoryConfig}/`));
  }

  private async processQuestion(
    question: LongMemEvalQuestion,
    options: PrepareOptions,
    model: any,
    memoryOptions: MemoryConfigOptions,
    parentSpinner: any,
    questionNumber: number,
    totalQuestions: number,
    isConcurrent: boolean = false,
    slotIndex?: number,
    activeQuestions?: Map<number, { questionId: string; status: string }>,
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
    const usesWorkingMemory = options.memoryConfig === 'working-memory' || options.memoryConfig === 'combined';

    // Create agent with appropriate model
    const agent = new Agent({
      name: 'prep-agent',
      instructions: usesWorkingMemory
        ? `You are a helpful assistant. When processing conversation history, extract and save specific user information to your working memory using the available tools. Pay close attention to:
- Personal details: full name, previous names, education (degree, school), occupation, location
- Daily routines: commute duration/method, exercise locations/activities, shopping locations, regular activities
- Preferences: entertainment choices (plays, movies), music/playlist names, hobbies, dietary preferences
- Specific events: dates, locations, names of events attended
- Purchases and services: where items were bought, what was purchased, subscription services used
Focus on concrete, specific details rather than general information. If you fail to retain working memory information when you make an update, it will cause data loss. Make sure you retain information, even if you don't see that information in the current conversation.`
        : 'Process and store conversation history',
      model: model,
      memory: memory,
    });

    // Process all haystack sessions
    const resourceId = `resource_${question.question_id}`;

    // Create output directory early to save progress
    const questionDir = join(
      options.outputDir || this.baseDir,
      options.dataset,
      options.memoryConfig,
      question.question_id,
    );
    await mkdir(questionDir, { recursive: true });

    // Check if this question has partial progress saved
    const progressFile = join(questionDir, 'progress.json');
    let processedSessionIds: Set<string> = new Set();

    if (existsSync(progressFile)) {
      try {
        const progress = JSON.parse(await readFile(progressFile, 'utf-8'));
        processedSessionIds = new Set(progress.processedSessionIds || []);

        // Restore previous state if exists
        if (progress.lastSavedDb && existsSync(join(questionDir, progress.lastSavedDb))) {
          await benchmarkStore.hydrate(join(questionDir, progress.lastSavedDb));
        }
        if (progress.lastSavedVector && existsSync(join(questionDir, progress.lastSavedVector))) {
          await benchmarkVectorStore.hydrate(join(questionDir, progress.lastSavedVector));
        }

        if (isConcurrent && slotIndex !== undefined && activeQuestions) {
          activeQuestions.set(slotIndex, {
            questionId: question.question_id,
            status: `Resuming from session ${processedSessionIds.size}/${question.haystack_sessions.length}`,
          });
        } else if (!isConcurrent) {
          parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Resuming from session ${processedSessionIds.size}/${question.haystack_sessions.length}`;
          console.log(
            chalk.yellow(
              `\n📂 Resuming ${question.question_id} from session ${processedSessionIds.size}/${question.haystack_sessions.length}`,
            ),
          );
        }
      } catch (e) {
        console.log(chalk.red(`Failed to load progress for ${question.question_id}, starting fresh`));
        processedSessionIds = new Set();
      }
    }

    // Process sessions in batches to avoid overwhelming the system
    const BATCH_SIZE = usesWorkingMemory ? 1 : 50; // Process x sessions at a time. working memory must run one at a time since each conversation will use resource working memory from the last conversation and build on it.
    let processedSessions = processedSessionIds.size;

    // For debugging working memory
    if (usesWorkingMemory && processedSessions === 0 && !isConcurrent) {
      console.log(chalk.yellow(`\n🧠 Working memory enabled for question ${question.question_id}`));
      console.log(chalk.gray(`Resource ID: ${resourceId}`));
    }

    for (let i = 0; i < question.haystack_sessions.length; i += BATCH_SIZE) {
      const sessionBatch = question.haystack_sessions.slice(i, i + BATCH_SIZE);
      const sessionIdBatch = question.haystack_session_ids.slice(i, i + BATCH_SIZE);

      // Update progress
      if (isConcurrent && slotIndex !== undefined && activeQuestions) {
        // Update active questions status
        activeQuestions.set(slotIndex, {
          questionId: question.question_id,
          status: `Processing ${processedSessions}/${question.haystack_sessions.length} sessions`,
        });
      } else if (!isConcurrent) {
        parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Processing ${processedSessions}/${question.haystack_sessions.length} sessions`;
      }

      // Process batch in parallel
      const batchPromises = sessionBatch.map(async (session, batchIdx) => {
        const sessionId = sessionIdBatch[batchIdx];

        // Skip if already processed
        if (processedSessionIds.has(sessionId)) {
          return;
        }

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
          //         const currentWorkingMemory = await memory.getWorkingMemory({
          //   threadId: sessionId,
          //   resourceId,
          //   memoryConfig: memoryOptions.options,
          // });

          if (usesWorkingMemory) {
            // console.log(
            //   chalk.yellow(
            //     `\nexisting working memory\n${await memory.getWorkingMemory({ threadId: sessionId, resourceId, memoryConfig: memoryOptions.options })}\n`,
            //   ),
            // );
          }
          // Process through agent to save to memory
          const result = await agent.generate(messages, {
            threadId: sessionId, // Use haystack session ID as thread ID
            resourceId,
            memoryOptions: memoryOptions.options,
          });
          // if (usesWorkingMemory) {
          //   // console.log(`\n\nsent instruction`, chalk.red(JSON.parse(result.request.body!).messages[1].content), `\n`);
          //   // console.log(JSON.stringify(result.request.body, null, 2));
          //   // Check if working memory was updated
          //   const hasWorkingMemoryUpdate = result.response.messages.some((msg: any) =>
          //     msg.content?.some?.((c: any) => c.toolName === 'updateWorkingMemory'),
          //   );
          //
          //   // console.log(memoryOptions.options);
          //   if (hasWorkingMemoryUpdate) {
          //     // Get the current working memory state
          //     const currentWorkingMemory = await memory.getWorkingMemory({
          //       threadId: sessionId,
          //       resourceId,
          //       memoryConfig: memoryOptions.options,
          //     });
          //     console.log(chalk.cyan(`\n📝 Working memory after session ${sessionId}:`));
          //     console.log(chalk.blue(currentWorkingMemory));
          //     console.log(chalk.blue(`working memory was updated.`));
          //   }
          // }
        }

        // Mark as processed
        processedSessionIds.add(sessionId);

        // Save progress after each session if using working memory
        if (usesWorkingMemory) {
          await writeFile(
            progressFile,
            JSON.stringify({
              processedSessionIds: Array.from(processedSessionIds),
              lastSavedDb: 'db.json',
              lastSavedVector: 'vector.json',
            }),
          );

          // Persist current state
          await benchmarkStore.persist(join(questionDir, 'db.json'));
          if (options.memoryConfig === 'semantic-recall' || options.memoryConfig === 'combined') {
            await benchmarkVectorStore.persist(join(questionDir, 'vector.json'));
          }
        }
      });

      await Promise.all(batchPromises);

      // Update processed count based on actual processed sessions
      processedSessions = processedSessionIds.size;

      // Update progress after batch completes
      if (isConcurrent && slotIndex !== undefined && activeQuestions) {
        activeQuestions.set(slotIndex, {
          questionId: question.question_id,
          status: `Processing ${processedSessions}/${question.haystack_sessions.length} sessions`,
        });
      } else if (!isConcurrent) {
        parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Processing ${processedSessions}/${question.haystack_sessions.length} sessions`;
      }
    }

    // Update status to saving
    if (isConcurrent && slotIndex !== undefined && activeQuestions) {
      activeQuestions.set(slotIndex, {
        questionId: question.question_id,
        status: 'Saving data...',
      });
    } else if (!isConcurrent) {
      parentSpinner.text = `Question ${questionNumber}/${totalQuestions}: ${question.question_id} - Saving data...`;
    }

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

    // Clean up progress file after successful completion
    if (existsSync(progressFile)) {
      await writeFile(
        progressFile,
        JSON.stringify({
          processedSessionIds: Array.from(processedSessionIds),
          completed: true,
          completedAt: new Date().toISOString(),
        }),
      );
    }
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
              scope: 'resource',
              template: `# User Context
## Personal Information
- **Name**: 
- **Previous Names**: 
- **Education**: 
- **Occupation**: 
- **Location**: 

## Daily Life & Activities
- **Commute**: 
- **Exercise/Fitness**: 
- **Shopping Habits**: 
- **Regular Activities**: 

## Preferences & Interests
- **Entertainment**: 
- **Music/Playlists**: 
- **Hobbies**: 
- **Food/Dietary**: 

## Events & Experiences
- **Recent Events**: 
- **Travel**: 
- **Cultural Activities**: 

## Purchases & Services
- **Recent Purchases**: 
- **Subscriptions**: 
- **Frequently Used Services**: `,
            },
          },
        };

      case 'combined':
        return {
          type: 'combined',
          options: {
            lastMessages: 10,
            semanticRecall: {
              topK: 10,
              messageRange: 5,
              scope: 'resource',
            },
            workingMemory: {
              enabled: true,
              scope: 'resource',
              template: `# User Context
## Personal Information
- **Name**: 
- **Previous Names**: 
- **Education**: 
- **Occupation**: 
- **Location**: 

## Daily Life & Activities
- **Commute**: 
- **Exercise/Fitness**: 
- **Shopping Habits**: 
- **Regular Activities**: 

## Preferences & Interests
- **Entertainment**: 
- **Music/Playlists**: 
- **Hobbies**: 
- **Food/Dietary**: 

## Events & Experiences
- **Recent Events**: 
- **Travel**: 
- **Cultural Activities**: 

## Purchases & Services
- **Recent Purchases**: 
- **Subscriptions**: 
- **Frequently Used Services**: `,
            },
          },
        };

      default:
        throw new Error(`Unknown memory config: ${memoryConfig}`);
    }
  }
}
