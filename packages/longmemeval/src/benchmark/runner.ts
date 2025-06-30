import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import * as readline from 'readline';
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
  BenchmarkMetrics
} from '../data/types';
import { MastraMemoryAdapter } from '../memory-adapters/mastra-adapter';
import { QAEvaluator } from '../evaluation/qa-evaluator';

export interface RunnerConfig {
  mastra: Mastra;
  agent: Agent;
  storage?: MastraStorage;
  vector?: MastraVector;
  embedder?: EmbeddingModel<string>;
  evaluatorApiKey?: string;
  outputDir?: string;
  concurrency?: number;
}

export class BenchmarkRunner {
  private config: RunnerConfig;
  private loader: DatasetLoader;
  private evaluator: QAEvaluator;
  private outputDir: string;
  private isShuttingDown: boolean = false;
  private activeProcessing: Set<Promise<any>> = new Set();

  constructor(config: RunnerConfig) {
    this.config = config;
    this.loader = new DatasetLoader();
    this.evaluator = new QAEvaluator({
      apiKey: config.evaluatorApiKey || process.env.OPENAI_API_KEY,
    });
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
    
    // Apply subset if specified
    if (benchmarkConfig.subset && benchmarkConfig.subset < questions.length) {
      questions = questions.slice(0, benchmarkConfig.subset);
      spinner.succeed(`Loaded ${benchmarkConfig.subset} questions (subset of ${await this.loader.loadDataset(benchmarkConfig.dataset).then(q => q.length)})`);
    } else {
      spinner.succeed(`Loaded ${questions.length} questions`);
    }

    // Get memory configuration
    const memoryConfig = this.getMemoryConfig(benchmarkConfig.memoryConfig);
    
    // Initialize memory adapter
    const adapter = new MastraMemoryAdapter(
      this.config.mastra,
      this.config.agent,
      memoryConfig,
      this.config.storage,
      this.config.vector,
      this.config.embedder
    );

    await adapter.initialize();

    // Process questions with parallelization
    const results: EvaluationResult[] = [];
    const hypotheses = new Map<string, string>();
    const concurrency = this.config.concurrency || 5; // Default to 5 parallel requests
    let completedCount = 0;
    
    console.log(chalk.blue('\n📝 Processing questions...'));
    console.log(chalk.gray(`Running with ${concurrency} parallel workers`));
    console.log(chalk.gray('Press Ctrl+C to gracefully stop\n'));

    // Set up graceful shutdown
    let ctrlCCount = 0;
    const cleanup = async (signal: string) => {
      if (this.isShuttingDown) {
        ctrlCCount++;
        if (ctrlCCount >= 2) {
          console.log(chalk.red('\n\n⚠️  Force quit requested. Exiting immediately...'));
          process.exit(1);
        }
        return;
      }
      
      // First Ctrl+C - ask for confirmation
      console.log(chalk.yellow(`\n\n⏸️  Interrupt received. Press Ctrl+C again to stop, or wait to continue...`));
      
      // Set a timeout to reset the interrupt state
      const resetTimeout = setTimeout(() => {
        console.log(chalk.green('\n▶️  Continuing benchmark...\n'));
        ctrlCCount = 0;
      }, 3000);
      
      // Wait for second Ctrl+C
      process.once('SIGINT', async () => {
        clearTimeout(resetTimeout);
        this.isShuttingDown = true;
        
        console.log(chalk.yellow('\n🛑 Stopping benchmark and saving results...'));
        
        // Wait for active processing to complete
        if (this.activeProcessing.size > 0) {
          console.log(chalk.gray(`Waiting for ${this.activeProcessing.size} active requests to complete...`));
          await Promise.all(this.activeProcessing);
        }
        
        // Save final results
        const processedResults = results.filter(r => r);
        if (processedResults.length > 0) {
          await this.saveResults(runDir, processedResults, hypotheses, questions.slice(0, processedResults.length));
          const metrics = this.evaluator.calculateMetrics(processedResults);
          await this.saveMetrics(runDir, metrics, benchmarkConfig);
          
          console.log(chalk.yellow(`\n✅ Saved results for ${processedResults.length} questions to: ${runDir}`));
          console.log(chalk.yellow(`Accuracy so far: ${(metrics.overall_accuracy * 100).toFixed(2)}%\n`));
        }
        
        process.exit(0);
      });
    };
    
    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', async () => {
      // For SIGTERM, exit immediately without confirmation
      this.isShuttingDown = true;
      console.log(chalk.yellow('\n\n🛑 Termination signal received, saving results...'));
      const processedResults = results.filter(r => r);
      if (processedResults.length > 0) {
        await this.saveResults(runDir, processedResults, hypotheses, questions.slice(0, processedResults.length));
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
      console.log(chalk.gray(`\n⏳ Starting batch [${batchStartIdx}-${batchEndIdx}/${totalQuestions}]${elapsedMin > 0 ? ` (${elapsedMin}min elapsed)` : ''}...`));
      
      const batchPromises = batch.map(async ({ question, index }) => {
        try {
          // Load chat history
          const resourceId = `longmemeval_${benchmarkConfig.dataset}`;
          const threadId = await adapter.loadChatHistory(question, resourceId);
          
          // Query memory with the question
          const hypothesis = await adapter.queryMemory(
            question.question,
            threadId,
            resourceId
          );
          
          hypotheses.set(question.question_id, hypothesis);
          
          // Evaluate the answer
          const result = await this.evaluator.evaluateAnswer(question, hypothesis);
          
          // Clear thread to save memory
          await adapter.clearThread(threadId);
          
          // Show progress immediately when this question completes
          completedCount++;
          const statusIcon = result.is_correct ? chalk.green('✓') : chalk.red('✗');
          const timePerQ = Math.round((Date.now() - startTime) / completedCount / 1000);
          console.log(`[${completedCount}/${totalQuestions}] ${statusIcon} ${question.question_id} - ${question.question_type} ${chalk.gray(`(~${timePerQ}s/q)`)}`);
          
          return { result, question, index, error: null };
          
        } catch (error) {
          completedCount++;
          const timePerQ = Math.round((Date.now() - startTime) / completedCount / 1000);
          console.log(`[${completedCount}/${totalQuestions}] ${chalk.red('✗')} ${question.question_id} - ${question.question_type} ${chalk.red('(error)')} ${chalk.gray(`(~${timePerQ}s/q)`)}`);
          
          return {
            result: {
              question_id: question.question_id,
              hypothesis: '',
              is_correct: false,
              question_type: question.question_type,
            },
            question,
            index,
            error
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
        await this.saveResults(runDir, results.filter(r => r), hypotheses, questions.slice(0, processedCount));
        const accuracy = this.evaluator.calculateMetrics(results.filter(r => r)).overall_accuracy;
        console.log(chalk.gray(`\n💾 Saved intermediate results (${processedCount}/${totalQuestions}) - Accuracy: ${(accuracy * 100).toFixed(2)}%\n`));
      }
    }

    // Check if we completed all questions or were interrupted
    if (!this.isShuttingDown) {
      // Calculate and save final metrics
      console.log(chalk.blue('\n📊 Calculating metrics...\n'));
      const metrics = this.evaluator.calculateMetrics(results);
      
      await this.saveResults(runDir, results, hypotheses, questions);
      await this.saveMetrics(runDir, metrics, benchmarkConfig);
      
      this.printMetrics(metrics);
      
      console.log(chalk.green(`\n✅ Benchmark complete! Results saved to: ${runDir}\n`));
      
      return metrics;
    } else {
      // We were interrupted, metrics were already saved in cleanup
      const processedResults = results.filter(r => r);
      return this.evaluator.calculateMetrics(processedResults);
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
        };
      
      case 'last-k':
        return {
          type: 'last-k',
          lastK: 20,
        };
      
      case 'semantic-recall':
        return {
          type: 'semantic-recall',
          semanticRecallTopK: 10,
          semanticRecallMessageRange: 5,
        };
      
      case 'working-memory':
        return {
          type: 'working-memory',
          workingMemoryTemplate: `
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
        };
      
      case 'combined':
        return {
          type: 'combined',
          lastK: 10,
          semanticRecallTopK: 10,
        };
      
      default:
        throw new Error(`Unknown memory configuration: ${configType}`);
    }
  }

  /**
   * Save results to file
   */
  private async saveResults(
    runDir: string,
    results: EvaluationResult[],
    hypotheses: Map<string, string>,
    questions: LongMemEvalQuestion[]
  ): Promise<void> {
    // Save evaluation results
    const resultsPath = join(runDir, 'results.jsonl');
    const resultsContent = results
      .map(r => JSON.stringify(r))
      .join('\n');
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
  private async saveMetrics(
    runDir: string,
    metrics: any,
    config: BenchmarkConfig
  ): Promise<void> {
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
      console.log(chalk.bold('Abstention Accuracy:'), chalk.yellow(`${(metrics.abstention_accuracy * 100).toFixed(2)}%`));
    }
    
    console.log(chalk.bold('\nAccuracy by Question Type:'));
    for (const [type, typeMetrics] of Object.entries(metrics.accuracy_by_type)) {
      const { correct, total, accuracy } = typeMetrics as any;
      console.log(
        chalk.gray(`  ${type}:`),
        chalk.yellow(`${(accuracy * 100).toFixed(2)}%`),
        chalk.gray(`(${correct}/${total})`)
      );
    }
  }
}