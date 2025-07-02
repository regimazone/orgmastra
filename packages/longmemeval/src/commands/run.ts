import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { openai } from '@ai-sdk/openai';
import chalk from 'chalk';
import ora from 'ora';
import { join } from 'path';
import { readdir, readFile, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

import { DatasetLoader } from '../data/loader';
import { BenchmarkStore, BenchmarkVectorStore } from '../storage';
import { LongMemEvalMetric } from '../evaluation/longmemeval-metric';
import type {
  MemoryConfigOptions,
  EvaluationResult,
  BenchmarkMetrics,
  QuestionType,
} from '../data/types';

export interface RunOptions {
  dataset: 'longmemeval_s' | 'longmemeval_m' | 'longmemeval_oracle';
  memoryConfig: 'full-history' | 'last-k' | 'semantic-recall' | 'working-memory' | 'combined';
  model: string;
  preparedDataDir?: string;
  outputDir?: string;
  subset?: number;
  concurrency?: number;
}

interface PreparedQuestionMeta {
  questionId: string;
  questionType: string;
  resourceId: string;
  threadIds: string[];
  memoryConfig: string;
  question: string;
  answer: string;
  evidenceSessionIds?: string[];
}

export class RunCommand {
  private loader: DatasetLoader;
  private preparedDataDir: string;
  private outputDir: string;

  constructor() {
    this.loader = new DatasetLoader();
    this.preparedDataDir = './prepared-data';
    this.outputDir = './results';
  }

  async run(options: RunOptions): Promise<BenchmarkMetrics> {
    const runId = `run_${Date.now()}`;
    const runDir = join(options.outputDir || this.outputDir, runId);
    await mkdir(runDir, { recursive: true });

    console.log(chalk.blue(`\n🚀 Starting LongMemEval benchmark run: ${runId}\n`));
    console.log(chalk.gray(`Dataset: ${options.dataset}`));
    console.log(chalk.gray(`Model: ${options.model}`));
    console.log(chalk.gray(`Memory Config: ${options.memoryConfig}\n`));

    // Check if prepared data exists
    const preparedDir = join(options.preparedDataDir || this.preparedDataDir, options.dataset, options.memoryConfig);

    if (!existsSync(preparedDir)) {
      throw new Error(`Prepared data not found at: ${preparedDir}\nPlease run 'longmemeval prepare' first.`);
    }

    // Load prepared questions
    const spinner = ora('Loading prepared data...').start();
    const questionDirs = await readdir(preparedDir);
    const preparedQuestions: PreparedQuestionMeta[] = [];

    for (const questionDir of questionDirs) {
      const metaPath = join(preparedDir, questionDir, 'meta.json');
      if (existsSync(metaPath)) {
        const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
        preparedQuestions.push(meta);
      }
    }

    spinner.succeed(`Loaded ${preparedQuestions.length} prepared questions`);

    // Apply subset if requested
    const questionsToProcess = options.subset ? preparedQuestions.slice(0, options.subset) : preparedQuestions;

    console.log(chalk.yellow(`\nEvaluating ${questionsToProcess.length} questions\n`));

    // Get model provider
    const modelProvider = this.getModelProvider(options.model);

    // Process questions with concurrency control
    const results: EvaluationResult[] = [];
    const concurrency = options.concurrency || 5;
    const questionSpinner = ora('Evaluating questions...').start();

    let completedCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < questionsToProcess.length; i += concurrency) {
      const batch = questionsToProcess.slice(i, i + concurrency);
      
      // Update spinner with batch info
      questionSpinner.text = `Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(questionsToProcess.length / concurrency)} (${batch.length} questions)`;

      const batchResults = await Promise.all(
        batch.map(async (meta) => {
          const result = await this.evaluateQuestion(meta, preparedDir, modelProvider, options, questionSpinner);
          completedCount++;
          
          // Update spinner with progress
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const rate = elapsed > 0 ? completedCount / elapsed : 0;
          const remaining = rate > 0 ? Math.round((questionsToProcess.length - completedCount) / rate) : 0;
          
          questionSpinner.text = `Evaluated ${completedCount}/${questionsToProcess.length} questions (${Math.round(rate * 60)} q/min, ~${remaining}s remaining)`;
          
          return result;
        }),
      );
      results.push(...batchResults);
    }

    questionSpinner.succeed(`Evaluated ${results.length} questions`);

    // Calculate metrics
    console.log(chalk.blue('\n📊 Calculating metrics...\n'));
    const metrics = this.calculateMetrics(results);

    // Save results
    await this.saveResults(runDir, results, metrics, options);

    // Display results
    this.displayMetrics(metrics);

    return metrics;
  }

  private async evaluateQuestion(
    meta: PreparedQuestionMeta,
    preparedDir: string,
    modelProvider: any,
    options: RunOptions,
    spinner?: ora.Ora,
  ): Promise<EvaluationResult> {
    const questionStart = Date.now();
    
    // Update spinner with current question
    if (spinner) {
      spinner.text = `Evaluating question ${meta.questionId} (${meta.questionType}): "${meta.question.substring(0, 50)}${meta.question.length > 50 ? '...' : ''}"`;
    }
    
    // Load the prepared storage and vector store
    const questionDir = join(preparedDir, meta.questionId);
    const benchmarkStore = new BenchmarkStore();
    const benchmarkVectorStore = new BenchmarkVectorStore();

    await benchmarkStore.init();
    await benchmarkStore.hydrate(join(questionDir, 'db.json'));

    // Hydrate vector store if it exists
    const vectorPath = join(questionDir, 'vector.json');
    if (existsSync(vectorPath)) {
      await benchmarkVectorStore.hydrate(vectorPath);
      if (spinner) {
        spinner.text = `Loading vector embeddings for ${meta.questionId}...`;
      }
    }

    // Get memory configuration
    const memoryOptions = this.getMemoryOptions(options.memoryConfig);

    // Create memory with the hydrated stores
    const memory = new Memory({
      storage: benchmarkStore,
      vector: benchmarkVectorStore,
      embedder: openai.embedding('text-embedding-3-small'),
      options: memoryOptions.options,
    });

    // Create agent with the specified model
    const agent = new Agent({
      name: 'longmemeval-agent',
      model: modelProvider,
      instructions: `You are a helpful assistant with access to extensive conversation history. 
When answering questions, carefully review the conversation history to identify and use any relevant user preferences, interests, or specific details they have mentioned.
For example, if the user previously mentioned they prefer a specific software, tool, or approach, tailor your recommendations to match their stated preferences.
Be specific rather than generic when the user has expressed clear preferences in past conversations.`,
      memory,
    });

    // Create a fresh thread for the evaluation question
    const evalThreadId = `eval_${meta.questionId}_${Date.now()}`;
    
    if (spinner) {
      spinner.text = `Querying agent for ${meta.questionId} (${meta.threadIds.length} sessions, ${options.memoryConfig})...`;
    }

    // Ask the question and get response
    const response = await agent.generate(meta.question, {
      threadId: evalThreadId,
      resourceId: meta.resourceId,
    });

    // Evaluate the response using Mastra metric
    const metric = new LongMemEvalMetric({
      questionType: meta.questionType as any,
      isAbstention: meta.questionId.endsWith('_abs'),
    });

    const input = JSON.stringify({
      question: meta.question,
      answer: meta.answer,
    });

    const result = await metric.measure(input, response.text);
    const isCorrect = result.score === 1;
    
    const elapsed = ((Date.now() - questionStart) / 1000).toFixed(1);
    
    // Log the result above the spinner
    if (spinner) {
      spinner.clear();
      console.log(
        chalk.blue(`▶ ${meta.questionId}`),
        chalk.gray(`(${meta.questionType})`),
        chalk[isCorrect ? 'green' : 'red'](`${isCorrect ? '✓' : '✗'}`),
        chalk.gray(`${elapsed}s`)
      );
      if (!isCorrect) {
        console.log(chalk.gray(`  Q: "${meta.question}"`));
        console.log(chalk.gray(`  A: "${response.text.substring(0, 80)}${response.text.length > 80 ? '...' : ''}"`));
        console.log(chalk.yellow(`  Expected: "${meta.answer}"`));
      }
      spinner.render();
    }

    return {
      question_id: meta.questionId,
      hypothesis: response.text,
      question_type: meta.questionType as QuestionType,
      is_correct: isCorrect,
    };
  }

  private getModelProvider(model: string) {
    // Map model names to providers
    if (model.startsWith('gpt-')) {
      return openai(model);
    }

    // Add more providers as needed
    throw new Error(`Unsupported model: ${model}. Please configure the model provider.`);
  }

  private getMemoryOptions(memoryConfig: string): MemoryConfigOptions {
    switch (memoryConfig) {
      case 'full-history':
        return {
          type: 'full-history',
          options: {
            lastMessages: 999999,
            semanticRecall: false,
            workingMemory: { enabled: false },
          },
        };

      case 'last-k':
        return {
          type: 'last-k',
          options: {
            lastMessages: 50,
            semanticRecall: false,
            workingMemory: { enabled: false },
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
            workingMemory: { enabled: false },
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
- **First Name**: 
- **Last Name**: 
- **Location**: 
- **Occupation**: 
- **Interests**: 
- **Goals**: 
- **Events**: 
- **Facts**: 
- **Projects**: `,
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
              template: `# User Context
- **First Name**: 
- **Last Name**: 
- **Location**: 
- **Occupation**: 
- **Interests**: 
- **Goals**: 
- **Events**: 
- **Facts**: 
- **Projects**: `,
            },
          },
        };

      default:
        throw new Error(`Unknown memory config: ${memoryConfig}`);
    }
  }

  private async saveResults(
    runDir: string,
    results: EvaluationResult[],
    metrics: BenchmarkMetrics,
    options: RunOptions,
  ): Promise<void> {
    // Save raw results
    const resultsPath = join(runDir, 'results.jsonl');
    const resultsContent = results.map(r => JSON.stringify(r)).join('\n');
    await writeFile(resultsPath, resultsContent);

    // Save metrics
    const metricsPath = join(runDir, 'metrics.json');
    const metricsData = {
      ...metrics,
      config: {
        dataset: options.dataset,
        model: options.model,
        memoryConfig: options.memoryConfig,
        subset: options.subset,
      },
      timestamp: new Date().toISOString(),
    };
    await writeFile(metricsPath, JSON.stringify(metricsData, null, 2));

    console.log(chalk.gray(`\nResults saved to: ${runDir}`));
  }

  private calculateMetrics(results: EvaluationResult[]): BenchmarkMetrics {
    const metrics: BenchmarkMetrics = {
      overall_accuracy: 0,
      accuracy_by_type: {} as Record<QuestionType, { correct: number; total: number; accuracy: number }>,
      abstention_accuracy: 0,
      total_questions: results.length,
      correct_answers: 0,
      abstention_correct: 0,
      abstention_total: 0,
    };

    // Calculate overall metrics
    for (const result of results) {
      if (result.is_correct) {
        metrics.correct_answers++;
      }

      // Track by question type
      if (result.question_type) {
        const type = result.question_type;
        if (!metrics.accuracy_by_type[type]) {
          metrics.accuracy_by_type[type] = { correct: 0, total: 0, accuracy: 0 };
        }
        metrics.accuracy_by_type[type].total++;
        if (result.is_correct) {
          metrics.accuracy_by_type[type].correct++;
        }
      }

      // Track abstention separately
      if (result.question_id.endsWith('_abs')) {
        metrics.abstention_total = (metrics.abstention_total || 0) + 1;
        if (result.is_correct) {
          metrics.abstention_correct = (metrics.abstention_correct || 0) + 1;
        }
      }
    }

    // Calculate accuracies
    metrics.overall_accuracy = metrics.total_questions > 0 ? metrics.correct_answers / metrics.total_questions : 0;

    for (const type in metrics.accuracy_by_type) {
      const typeMetrics = metrics.accuracy_by_type[type as QuestionType];
      typeMetrics.accuracy = typeMetrics.total > 0 ? typeMetrics.correct / typeMetrics.total : 0;
    }

    if (metrics.abstention_total && metrics.abstention_total > 0) {
      metrics.abstention_accuracy = (metrics.abstention_correct || 0) / metrics.abstention_total;
    }

    return metrics;
  }

  private displayMetrics(metrics: BenchmarkMetrics): void {
    console.log(chalk.bold('\n📊 Benchmark Results\n'));
    
    // Overall summary with visual indicator
    const accuracyColor = metrics.overall_accuracy >= 0.8 ? 'green' : 
                         metrics.overall_accuracy >= 0.6 ? 'yellow' : 'red';
    console.log(chalk.bold('Overall Accuracy:'), chalk[accuracyColor](`${(metrics.overall_accuracy * 100).toFixed(2)}%`));
    console.log(chalk.bold('Total Questions:'), metrics.total_questions);
    console.log(chalk.bold('Correct Answers:'), chalk.green(metrics.correct_answers), '/', chalk.red(metrics.total_questions - metrics.correct_answers));

    // Question type breakdown
    console.log(chalk.bold('\nAccuracy by Question Type:'));
    for (const [type, typeMetrics] of Object.entries(metrics.accuracy_by_type)) {
      const { correct, total, accuracy } = typeMetrics;
      const typeColor = accuracy >= 0.8 ? 'green' : accuracy >= 0.6 ? 'yellow' : 'red';
      
      // Create a simple progress bar
      const barLength = 20;
      const filledLength = Math.round(accuracy * barLength);
      const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
      
      console.log(
        chalk.gray(`  ${type.padEnd(25)}:`),
        chalk[typeColor](`${(accuracy * 100).toFixed(1).padStart(5)}%`),
        chalk.gray(`[${bar}]`),
        chalk.gray(`(${correct}/${total})`),
      );
    }
    
    // Abstention accuracy if present
    if (metrics.abstention_total && metrics.abstention_total > 0) {
      console.log(chalk.bold('\nAbstention Accuracy:'), 
        chalk.yellow(`${(metrics.abstention_accuracy * 100).toFixed(2)}%`),
        chalk.gray(`(${metrics.abstention_correct || 0}/${metrics.abstention_total})`));
    }
  }
}
