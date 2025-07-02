import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MastraStorage } from '@mastra/core';
import type { MastraVector } from '@mastra/core';
import type { EmbeddingModel } from 'ai';

import { DatasetLoader } from '../data/loader';
import type {
  BenchmarkConfig,
  MemoryConfigOptions,
  LongMemEvalQuestion,
  EvaluationResult,
  BenchmarkMetrics,
} from '../data/types';
import { MastraMemoryAdapter } from '../memory-adapters/mastra-adapter';
import { LongMemEvalMetric } from '../evaluation/longmemeval-metric';

export interface RunnerConfig {
  mastra: Mastra;
  agent: Agent;
  storage?: MastraStorage;
  vector?: MastraVector;
  embedder?: EmbeddingModel<string>;
  outputDir?: string;
  concurrency?: number;
}

export class BenchmarkRunner {
  private config: RunnerConfig;
  private loader: DatasetLoader;
  private outputDir: string;
  private isShuttingDown: boolean = false;
  private activeProcessing: Set<Promise<any>> = new Set();

  constructor(config: RunnerConfig) {
    this.config = config;
    this.loader = new DatasetLoader();
    this.outputDir = config.outputDir || join(process.cwd(), 'results');
  }

  /**
   * Run the full benchmark
   */
  async run(benchmarkConfig: BenchmarkConfig): Promise<BenchmarkMetrics> {
    const runId = `run_${Date.now()}`;
    const runDir = join(this.outputDir, runId);
    await mkdir(runDir, { recursive: true });

    console.log(chalk.blue(`\n🚀 Starting LongMemEval benchmark run: ${runId}\n`));
    console.log(chalk.gray(`Dataset: ${benchmarkConfig.dataset}`));
    console.log(chalk.gray(`Model: ${benchmarkConfig.model}`));
    console.log(chalk.gray(`Memory Config: ${benchmarkConfig.memoryConfig}\n`));

    // Load dataset
    const spinner = ora('Loading dataset...').start();
    let questions = await this.loader.loadDataset(benchmarkConfig.dataset);

    // Filter by question type if specified
    if (benchmarkConfig.questionType) {
      questions = questions.filter(q => q.question_type === benchmarkConfig.questionType);
      if (questions.length === 0) {
        spinner.fail(`No questions found with type: ${benchmarkConfig.questionType}`);
        throw new Error(`Invalid question type: ${benchmarkConfig.questionType}`);
      }
    }

    // Apply subset if specified
    if (benchmarkConfig.subset && benchmarkConfig.subset < questions.length) {
      questions = questions.slice(3, benchmarkConfig.subset + 7);
      spinner.succeed(
        `Loaded ${questions.length} questions (subset of ${benchmarkConfig.questionType || 'all types'})`,
      );
    } else {
      spinner.succeed(
        `Loaded ${questions.length} questions${benchmarkConfig.questionType ? ` (type: ${benchmarkConfig.questionType})` : ''}`,
      );
    }

    console.log({ benchmarkConfig });
    // Get memory configuration
    const memoryConfig = this.getMemoryConfig(benchmarkConfig.memoryConfig);
    console.log({ memoryConfig });

    // Initialize memory adapter
    const adapter = new MastraMemoryAdapter(this.config.agent, memoryConfig, this.config.storage, this.config.vector);

    await adapter.initialize();

    // Process questions with parallelization
    const results: EvaluationResult[] = [];
    const hypotheses = new Map<string, string>();
    const concurrency = 1;
    // const concurrency = this.config.concurrency || 5; // Default to 5 parallel requests
    let completedCount = 0;

    console.log(chalk.blue('\n📝 Processing questions...'));
    console.log(chalk.gray(`Running with ${concurrency} parallel workers`));
    console.log(chalk.gray('Press Ctrl+C to stop and save results\n'));

    // Set up graceful shutdown
    const handleInterrupt = async () => {
      if (this.isShuttingDown) {
        console.log(chalk.red('\n\n⚠️  Force quit requested. Exiting immediately...'));
        process.exit(1);
      }

      this.isShuttingDown = true;
      console.log(chalk.yellow('\n\n🛑 Stopping benchmark and saving results...'));

      // Save final results without waiting
      const processedResults = results.filter(r => r);
      if (processedResults.length > 0) {
        try {
          await this.saveResults(runDir, processedResults, hypotheses, questions.slice(0, processedResults.length));
          const metrics = this.calculateMetrics(processedResults);
          await this.saveMetrics(runDir, metrics, benchmarkConfig);

          console.log(chalk.green(`\n✅ Saved results for ${processedResults.length} questions to: ${runDir}`));
          console.log(chalk.yellow(`Accuracy so far: ${(metrics.overall_accuracy * 100).toFixed(2)}%\n`));
        } catch (error) {
          console.log(chalk.red('Failed to save results:'), error);
        }
      }

      // Force exit immediately
      process.exit(0);
    };

    // Set up signal handlers
    process.on('SIGINT', handleInterrupt);

    process.on('SIGTERM', async () => {
      // For SIGTERM, exit immediately without confirmation
      this.isShuttingDown = true;
      console.log(chalk.yellow('\n\n🛑 Termination signal received, saving results...'));
      const processedResults = results.filter(r => r);
      if (processedResults.length > 0) {
        try {
          await this.saveResults(runDir, processedResults, hypotheses, questions.slice(0, processedResults.length));
        } catch (error) {
          console.log(chalk.red('Failed to save results:'), error);
        }
      }
      process.exit(0);
    });

    // Create a queue of questions with indices
    const questionQueue = questions.map((q, idx) => ({ question: q, index: idx }));
    let processedCount = 0;
    const totalQuestions = questions.length;
    const startTime = Date.now();

    // Process questions in batches
    while (questionQueue.length > 0 && !this.isShuttingDown) {
      const batch = questionQueue.splice(0, concurrency);

      // Show initial progress for batch
      const batchStartIdx = processedCount + 1;
      const batchEndIdx = Math.min(processedCount + batch.length, totalQuestions);
      const elapsedMin = Math.floor((Date.now() - startTime) / 60000);
      console.log(
        chalk.gray(
          `\n⏳ Starting batch [${batchStartIdx}-${batchEndIdx}/${totalQuestions}]${elapsedMin > 0 ? ` (${elapsedMin}min elapsed)` : ''}...`,
        ),
      );

      const batchPromises = batch.map(async ({ question, index }) => {
        // Check if shutting down
        if (this.isShuttingDown) {
          return {
            result: {
              question_id: question.question_id,
              hypothesis: '',
              is_correct: false,
              question_type: question.question_type,
            },
            question,
            index,
            error: new Error('Shutdown'),
          };
        }

        try {
          // Load chat history
          const resourceId = `longmemeval_${benchmarkConfig.dataset}`;
          const threadId = await adapter.loadChatHistory(question, resourceId);

          console.log(`asking ${question.question} to agent`);
          // Query memory with the question
          const hypothesis = await adapter.queryMemory(question.question, threadId, resourceId);
          console.log(`got agent response`);

          hypotheses.set(question.question_id, hypothesis);

          // Evaluate the answer using Mastra metric
          const metric = new LongMemEvalMetric({
            questionType: question.question_type,
            isAbstention: question.question_id.endsWith('_abs'),
          });
          
          const input = JSON.stringify({
            question: question.question,
            answer: question.answer,
          });
          
          const evalResult = await metric.measure(input, hypothesis);
          const result = {
            question_id: question.question_id,
            hypothesis,
            is_correct: evalResult.score === 1,
            question_type: question.question_type,
          };
          console.log(`evaluator result is correct: ${result.is_correct}`);

          // Show progress immediately when this question completes
          if (!this.isShuttingDown) {
            completedCount++;
            const statusIcon = result.is_correct ? chalk.green('✓') : chalk.red('✗');
            const timePerQ = Math.round((Date.now() - startTime) / completedCount / 1000);
            console.log(
              `[${completedCount}/${totalQuestions}] ${statusIcon} ${question.question_id} - ${question.question_type} ${chalk.gray(`(~${timePerQ}s/q)`)}`,
            );
          }

          return { result, question, index, error: null };
        } catch (error) {
          if (!this.isShuttingDown) {
            completedCount++;
            const timePerQ = Math.round((Date.now() - startTime) / completedCount / 1000);
            console.log(
              `[${completedCount}/${totalQuestions}] ${chalk.red('✗')} ${question.question_id} - ${question.question_type} ${chalk.red('(error)')} ${chalk.gray(`(~${timePerQ}s/q)`)}`,
            );
            console.error('Error details:', error);
          }

          return {
            result: {
              question_id: question.question_id,
              hypothesis: '',
              is_correct: false,
              question_type: question.question_type,
            },
            question,
            index,
            error,
          };
        }
      });

      // Track active processing
      const batchPromise = Promise.all(batchPromises);
      this.activeProcessing.add(batchPromise);

      // Wait for batch to complete
      const batchResults = await batchPromise;
      this.activeProcessing.delete(batchPromise);

      // Store results in correct order
      for (const { result, index } of batchResults) {
        results[index] = result;
      }
      processedCount += batch.length;

      // Save intermediate results every 50 questions
      if (processedCount % 50 === 0 || processedCount === totalQuestions) {
        await this.saveResults(
          runDir,
          results.filter(r => r),
          hypotheses,
          questions.slice(0, processedCount),
        );
        const accuracy = this.calculateMetrics(results.filter(r => r)).overall_accuracy;
        console.log(
          chalk.gray(
            `\n💾 Saved intermediate results (${processedCount}/${totalQuestions}) - Accuracy: ${(accuracy * 100).toFixed(2)}%\n`,
          ),
        );
      }
    }

    // Check if we completed all questions or were interrupted
    if (!this.isShuttingDown) {
      // Calculate and save final metrics
      console.log(chalk.blue('\n📊 Calculating metrics...\n'));
      const metrics = this.calculateMetrics(results);

      await this.saveResults(runDir, results, hypotheses, questions);
      await this.saveMetrics(runDir, metrics, benchmarkConfig);

      this.printMetrics(metrics);

      console.log(chalk.green(`\n✅ Benchmark complete! Results saved to: ${runDir}\n`));

      // Clean up signal handlers
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');

      return metrics;
    } else {
      // We were interrupted, metrics were already saved in cleanup
      const processedResults = results.filter(r => r);
      return this.calculateMetrics(processedResults);
    }
  }

  /**
   * Get memory configuration options
   */
  private getMemoryConfig(configType: string): MemoryConfigOptions {
    switch (configType) {
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
            lastMessages: 20,
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
              messageRange: 5,
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
              template: `
# User Information
- **First Name**: 
- **Last Name**: 
- **Location**: 
- **Occupation**: 
- **Interests**: 
- **Goals**: 
- **Events**: 
- **Facts**: 
- **Projects**: 
`,
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
            },
          },
        };

      default:
        throw new Error(`Unknown memory configuration: ${configType}`);
    }
  }

  /**
   * Calculate metrics from evaluation results
   */
  private calculateMetrics(results: EvaluationResult[]): BenchmarkMetrics {
    const metrics: BenchmarkMetrics = {
      overall_accuracy: 0,
      accuracy_by_type: {},
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
      const type = result.question_type;
      if (!metrics.accuracy_by_type[type]) {
        metrics.accuracy_by_type[type] = { correct: 0, total: 0, accuracy: 0 };
      }
      metrics.accuracy_by_type[type].total++;
      if (result.is_correct) {
        metrics.accuracy_by_type[type].correct++;
      }

      // Track abstention separately
      if (result.question_id.endsWith('_abs')) {
        metrics.abstention_total++;
        if (result.is_correct) {
          metrics.abstention_correct++;
        }
      }
    }

    // Calculate accuracies
    metrics.overall_accuracy = metrics.total_questions > 0 
      ? metrics.correct_answers / metrics.total_questions 
      : 0;

    for (const type in metrics.accuracy_by_type) {
      const typeMetrics = metrics.accuracy_by_type[type];
      typeMetrics.accuracy = typeMetrics.total > 0 
        ? typeMetrics.correct / typeMetrics.total 
        : 0;
    }

    if (metrics.abstention_total > 0) {
      metrics.abstention_accuracy = metrics.abstention_correct / metrics.abstention_total;
    }

    return metrics;
  }

  /**
   * Save results to file
   */
  private async saveResults(
    runDir: string,
    results: EvaluationResult[],
    hypotheses: Map<string, string>,
    questions: LongMemEvalQuestion[],
  ): Promise<void> {
    // Save evaluation results
    const resultsPath = join(runDir, 'results.jsonl');
    const resultsContent = results.map(r => JSON.stringify(r)).join('\n');
    await writeFile(resultsPath, resultsContent);

    // Save hypotheses
    const hypothesesPath = join(runDir, 'hypotheses.json');
    const hypothesesObj = Object.fromEntries(hypotheses);
    await writeFile(hypothesesPath, JSON.stringify(hypothesesObj, null, 2));

    // Save questions for reference
    const questionsPath = join(runDir, 'questions.json');
    await writeFile(questionsPath, JSON.stringify(questions, null, 2));
  }

  /**
   * Save metrics to file
   */
  private async saveMetrics(runDir: string, metrics: any, config: BenchmarkConfig): Promise<void> {
    const metricsPath = join(runDir, 'metrics.json');
    const fullMetrics = {
      ...metrics,
      config,
      timestamp: new Date().toISOString(),
    };
    await writeFile(metricsPath, JSON.stringify(fullMetrics, null, 2));
  }

  /**
   * Print metrics to console
   */
  private printMetrics(metrics: any): void {
    console.log(chalk.bold('Overall Accuracy:'), chalk.yellow(`${(metrics.overall_accuracy * 100).toFixed(2)}%`));
    console.log(chalk.bold('Total Questions:'), metrics.total_questions);
    console.log(chalk.bold('Correct Answers:'), metrics.correct_answers);

    if (metrics.abstention_total > 0) {
      console.log(
        chalk.bold('Abstention Accuracy:'),
        chalk.yellow(`${(metrics.abstention_accuracy * 100).toFixed(2)}%`),
      );
    }

    console.log(chalk.bold('\nAccuracy by Question Type:'));
    for (const [type, typeMetrics] of Object.entries(metrics.accuracy_by_type)) {
      const { correct, total, accuracy } = typeMetrics as any;
      console.log(
        chalk.gray(`  ${type}:`),
        chalk.yellow(`${(accuracy * 100).toFixed(2)}%`),
        chalk.gray(`(${correct}/${total})`),
      );
    }
  }
}
