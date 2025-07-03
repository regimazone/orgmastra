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
import type { MemoryConfigOptions, EvaluationResult, BenchmarkMetrics, QuestionType } from '../data/types';

export interface RunOptions {
  dataset: 'longmemeval_s' | 'longmemeval_m' | 'longmemeval_oracle';
  memoryConfig: 'full-history' | 'last-k' | 'semantic-recall' | 'working-memory' | 'combined';
  model: string;
  preparedDataDir?: string;
  outputDir?: string;
  subset?: number;
  concurrency?: number;
  questionId?: string;
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
    console.log(chalk.gray(`Memory Config: ${options.memoryConfig}`));
    if (options.subset) {
      console.log(chalk.gray(`Subset: ${options.subset} questions`));
    }
    console.log();

    // Check if prepared data exists
    const preparedDir = join(options.preparedDataDir || this.preparedDataDir, options.dataset, options.memoryConfig);

    if (!existsSync(preparedDir)) {
      throw new Error(`Prepared data not found at: ${preparedDir}\nPlease run 'longmemeval prepare' first.`);
    }

    // Load prepared questions
    const spinner = ora('Loading prepared data...').start();
    const questionDirs = await readdir(preparedDir);
    const preparedQuestions: PreparedQuestionMeta[] = [];

    let skippedCount = 0;
    for (const questionDir of questionDirs) {
      const questionPath = join(preparedDir, questionDir);
      const metaPath = join(questionPath, 'meta.json');
      const progressPath = join(questionPath, 'progress.json');

      // Check if question has been prepared
      if (existsSync(metaPath)) {
        // Check if there's an incomplete preparation in progress
        if (existsSync(progressPath)) {
          const progress = JSON.parse(await readFile(progressPath, 'utf-8'));
          if (!progress.completed) {
            skippedCount++;
            continue; // Skip this question as it's still being prepared
          }
        }

        const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
        preparedQuestions.push(meta);
      }
    }

    spinner.succeed(
      `Loaded ${preparedQuestions.length} prepared questions${skippedCount > 0 ? ` (skipped ${skippedCount} incomplete)` : ''}`,
    );

    if (skippedCount > 0) {
      console.log(
        chalk.yellow(
          `\n⚠️  ${skippedCount} question${skippedCount > 1 ? 's' : ''} skipped due to incomplete preparation.`,
        ),
      );
      console.log(chalk.gray(`   Run 'prepare' command to complete preparation.\n`));
    }

    // Filter by questionId if specified
    let questionsToProcess = preparedQuestions;
    if (options.questionId) {
      questionsToProcess = preparedQuestions.filter(q => q.questionId === options.questionId);
      if (questionsToProcess.length === 0) {
        throw new Error(`Question with ID "${options.questionId}" not found in prepared data`);
      }
      console.log(chalk.yellow(`\nFocusing on question: ${options.questionId}\n`));
    } else if (options.subset) {
      // Apply subset if requested
      questionsToProcess = preparedQuestions.slice(0, options.subset);
      console.log(
        chalk.gray(`\nApplying subset: ${options.subset} questions from ${preparedQuestions.length} total\n`),
      );
    }

    console.log(
      chalk.yellow(`\nEvaluating ${questionsToProcess.length} question${questionsToProcess.length !== 1 ? 's' : ''}\n`),
    );

    // Get model provider
    const modelProvider = this.getModelProvider(options.model);

    // Process questions with concurrency control
    const results: EvaluationResult[] = [];
    const concurrency = options.concurrency || 5;
    const questionSpinner = ora('Evaluating questions...').start();

    let completedCount = 0;
    let inProgressCount = 0;
    const startTime = Date.now();

    // Track active evaluations
    const activeEvaluations = new Map<number, { questionId: string; status: string }>();

    // Function to update progress display
    let lastText = '';
    const updateProgress = () => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = elapsed > 0 ? completedCount / elapsed : 0;
      const remaining = rate > 0 ? Math.round((questionsToProcess.length - completedCount) / rate) : 0;

      let progressText = `Overall: ${completedCount}/${questionsToProcess.length} (${inProgressCount} in progress, ${Math.round(rate * 60)} q/min, ~${remaining}s remaining)`;

      if (activeEvaluations.size > 0 && concurrency > 1) {
        progressText += '\n\nActive evaluations:';

        // Sort active evaluations by completion status
        const sortedEvaluations = Array.from(activeEvaluations.entries())
          .map(([index, info]) => {
            // Extract session progress if available (e.g., "Querying agent for xxx (47 sessions, working-memory)...")
            const sessionMatch = info.status.match(/\((\d+)\s+sessions/);
            const totalSessions = sessionMatch ? parseInt(sessionMatch[1]) : 100;

            // Assign progress based on status
            let progress = 0;
            if (info.status.includes('Querying agent')) progress = 0.75;
            else if (info.status.includes('Loading vector')) progress = 0.5;
            else if (info.status.includes('Loading data')) progress = 0.25;
            else if (info.status.includes('Starting')) progress = 0.0;

            return { index, info, progress };
          })
          .sort((a, b) => b.progress - a.progress); // Sort by most complete first

        sortedEvaluations.forEach(({ index, info, progress }) => {
          const percentage = (progress * 100).toFixed(0);
          progressText += `\n  [${index + 1}] ${info.questionId} - ${info.status} (${percentage}%)`;
        });
      }

      if (lastText !== progressText) {
        lastText = progressText;
        questionSpinner.text = progressText;
      }
    };

    // Create a queue of questions to evaluate
    const questionQueue = [...questionsToProcess];

    // Function to process next question from queue
    const processNextQuestion = async (slotIndex: number): Promise<EvaluationResult[]> => {
      const workerResults: EvaluationResult[] = [];

      while (questionQueue.length > 0) {
        const meta = questionQueue.shift();
        if (!meta) break;

        inProgressCount++;
        activeEvaluations.set(slotIndex, { questionId: meta.questionId, status: 'Starting...' });
        // Don't update progress here - let the periodic timer handle it

        const result = await this.evaluateQuestion(
          meta,
          preparedDir,
          modelProvider,
          options,
          concurrency > 1
            ? {
                updateStatus: (status: string) => {
                  activeEvaluations.set(slotIndex, { questionId: meta.questionId, status });
                },
              }
            : questionSpinner,
        );

        completedCount++;
        inProgressCount--;
        activeEvaluations.delete(slotIndex);

        // Log result when running concurrently
        if (concurrency > 1) {
          // Temporarily clear the spinner to log cleanly
          questionSpinner.clear();

          console.log(
            chalk.blue(`▶ ${meta.questionId}`),
            chalk.gray(`(${meta.questionType})`),
            chalk[result.is_correct ? 'green' : 'red'](`${result.is_correct ? '✓' : '✗'}`),
            chalk.gray(`${((Date.now() - startTime) / 1000).toFixed(1)}s`),
          );
          if (!result.is_correct) {
            console.log(chalk.gray(`  Q: "${meta.question}"`));
            console.log(chalk.gray(`  A: "${result.hypothesis}"`));
            console.log(chalk.yellow(`  Expected: "${meta.answer}"`));
          }

          // Re-render the spinner
          questionSpinner.render();
        }

        // Don't update progress here - let the periodic timer handle it
        workerResults.push(result);
      }

      return workerResults;
    };

    // Set up periodic progress updates
    const progressInterval = setInterval(updateProgress, 500);

    // Create worker slots
    const workers = Array.from({ length: concurrency }, (_, i) => processNextQuestion(i));

    // Wait for all workers to complete and collect results
    const workerResults = await Promise.all(workers);

    // Process results from all workers
    for (const workerResultArray of workerResults) {
      results.push(...workerResultArray);
    }

    // Clear the interval
    clearInterval(progressInterval);

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
    spinner?: ora.Ora | { updateStatus: (status: string) => void },
  ): Promise<EvaluationResult> {
    const questionStart = Date.now();

    // Update status
    const updateStatus = (status: string) => {
      if (spinner && 'updateStatus' in spinner) {
        spinner.updateStatus(status);
      } else if (spinner && 'text' in spinner) {
        spinner.text = status;
      }
    };

    updateStatus(`Loading data for ${meta.questionId}...`);

    // Load the prepared storage and vector store
    const questionDir = join(preparedDir, meta.questionId);
    const benchmarkStore = new BenchmarkStore('read');
    const benchmarkVectorStore = new BenchmarkVectorStore('read');

    await benchmarkStore.init();
    await benchmarkStore.hydrate(join(questionDir, 'db.json'));

    // Hydrate vector store if it exists
    const vectorPath = join(questionDir, 'vector.json');
    if (existsSync(vectorPath)) {
      await benchmarkVectorStore.hydrate(vectorPath);
      updateStatus(`Loading vector embeddings for ${meta.questionId}...`);
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

    updateStatus(
      `Querying agent for ${meta.questionId} (${meta.threadIds.length} sessions, ${options.memoryConfig})...`,
    );

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

    // Store result info for logging after batch completes
    const resultInfo = {
      questionId: meta.questionId,
      questionType: meta.questionType,
      isCorrect,
      elapsed,
      question: meta.question,
      response: response.text,
      expected: meta.answer,
    };

    // If running with single spinner, log immediately
    const isOraSpinner = spinner && 'clear' in spinner;
    if (isOraSpinner) {
      spinner.clear();
      console.log(
        chalk.blue(`▶ ${meta.questionId}`),
        chalk.gray(`(${meta.questionType})`),
        chalk[isCorrect ? 'green' : 'red'](`${isCorrect ? '✓' : '✗'}`),
        chalk.gray(`${elapsed}s`),
      );
      if (!isCorrect) {
        console.log(chalk.gray(`  Q: "${meta.question}"`));
        console.log(chalk.gray(`  A: "${response.text}"`));
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
              topK: 5,
              messageRange: 5,
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
    const accuracyColor =
      metrics.overall_accuracy >= 0.8 ? 'green' : metrics.overall_accuracy >= 0.6 ? 'yellow' : 'red';
    console.log(
      chalk.bold('Overall Accuracy:'),
      chalk[accuracyColor](`${(metrics.overall_accuracy * 100).toFixed(2)}%`),
    );
    console.log(chalk.bold('Total Questions:'), metrics.total_questions);
    console.log(
      chalk.bold('Correct Answers:'),
      chalk.green(metrics.correct_answers),
      '/',
      chalk.red(metrics.total_questions - metrics.correct_answers),
    );

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

    // Calculate and display average accuracy across all question types
    const questionTypes = Object.keys(metrics.accuracy_by_type);
    if (questionTypes.length > 1) {
      const avgAccuracy =
        questionTypes.reduce((sum, type) => sum + metrics.accuracy_by_type[type as QuestionType].accuracy, 0) /
        questionTypes.length;

      const avgColor = avgAccuracy >= 0.8 ? 'green' : avgAccuracy >= 0.6 ? 'yellow' : 'red';
      console.log(chalk.gray(`  ${'─'.repeat(60)}`));
      console.log(
        chalk.gray(`  ${'Average'.padEnd(25)}:`),
        chalk.bold[avgColor](`${(avgAccuracy * 100).toFixed(1).padStart(5)}%`),
        chalk.gray(`(across ${questionTypes.length} question types)`),
      );
    }

    // Abstention accuracy if present
    if (metrics.abstention_total && metrics.abstention_total > 0) {
      console.log(
        chalk.bold('\nAbstention Accuracy:'),
        chalk.yellow(`${(metrics.abstention_accuracy * 100).toFixed(2)}%`),
        chalk.gray(`(${metrics.abstention_correct || 0}/${metrics.abstention_total})`),
      );
    }
  }
}
