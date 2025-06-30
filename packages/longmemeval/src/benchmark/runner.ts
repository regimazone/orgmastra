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
    
    console.log(chalk.blue('\n📝 Processing questions...'));
    console.log(chalk.gray(`Running with ${concurrency} parallel workers\n`));

    // Create a queue of questions with indices
    const questionQueue = questions.map((q, idx) => ({ question: q, index: idx }));
    let processedCount = 0;
    const totalQuestions = questions.length;
    
    // Process questions in batches
    while (questionQueue.length > 0) {
      const batch = questionQueue.splice(0, concurrency);
      
      const batchPromises = batch.map(async ({ question, index }) => {
        const progress = `[${processedCount + 1}-${Math.min(processedCount + batch.length, totalQuestions)}/${totalQuestions}]`;
        
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
          
          return { result, question, index, error: null };
          
        } catch (error) {
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
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process batch results
      for (const { result, question, index, error } of batchResults) {
        results[index] = result;
        processedCount++;
        
        const statusIcon = result.is_correct ? chalk.green('✓') : chalk.red('✗');
        const progress = `[${processedCount}/${totalQuestions}]`;
        
        if (error) {
          console.log(`${progress} ${statusIcon} ${question.question_id} - ${question.question_type} ${chalk.red('(error)')}`);
        } else {
          console.log(`${progress} ${statusIcon} ${question.question_id} - ${question.question_type}`);
        }
      }
      
      // Save intermediate results every 50 questions
      if (processedCount % 50 === 0 || processedCount === totalQuestions) {
        await this.saveResults(runDir, results.filter(r => r), hypotheses, questions.slice(0, processedCount));
        console.log(chalk.gray(`\n💾 Saved intermediate results (${processedCount}/${totalQuestions})\n`));
      }
    }

    // Calculate and save final metrics
    console.log(chalk.blue('\n📊 Calculating metrics...\n'));
    const metrics = this.evaluator.calculateMetrics(results);
    
    await this.saveResults(runDir, results, hypotheses, questions);
    await this.saveMetrics(runDir, metrics, benchmarkConfig);
    
    this.printMetrics(metrics);
    
    console.log(chalk.green(`\n✅ Benchmark complete! Results saved to: ${runDir}\n`));
    
    return metrics;
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