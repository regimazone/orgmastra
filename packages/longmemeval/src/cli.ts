#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { openai } from '@ai-sdk/openai';

import { BenchmarkRunner } from './benchmark/runner';
import { DatasetLoader } from './data/loader';
import { QAEvaluator } from './evaluation/qa-evaluator';
import type { BenchmarkConfig, EvaluationResult } from './data/types';

const program = new Command();

program
  .name('longmemeval')
  .description('LongMemEval benchmark for Mastra Memory')
  .version('0.1.0');

// Run benchmark command
program
  .command('run')
  .description('Run LongMemEval benchmark')
  .requiredOption('-d, --dataset <dataset>', 'Dataset to use (longmemeval_s, longmemeval_m, longmemeval_oracle)')
  .requiredOption('-m, --model <model>', 'Model to use (e.g., gpt-4o, claude-3-opus)')
  .option('-c, --memory-config <config>', 'Memory configuration (full-history, last-k, semantic-recall, working-memory, combined)', 'full-history')
  .option('-o, --output <dir>', 'Output directory for results')
  .option('--subset <n>', 'Run on subset of n questions', parseInt)
  .action(async (options) => {
    try {
      console.log(chalk.blue('\n🚀 LongMemEval Benchmark Runner\n'));

      // Check for OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red('Error: OPENAI_API_KEY environment variable is not set'));
        console.error(chalk.gray('Please set it in your environment or .env file'));
        process.exit(1);
      }

      // Validate dataset option
      const validDatasets = ['longmemeval_s', 'longmemeval_m', 'longmemeval_oracle', 'sample_data'];
      if (!validDatasets.includes(options.dataset)) {
        console.error(chalk.red(`Invalid dataset: ${options.dataset}`));
        console.error(chalk.gray(`Valid options: ${validDatasets.join(', ')}`));
        process.exit(1);
      }

      // Check if dataset exists and download if needed
      if (options.dataset !== 'sample_data') {
        await ensureDatasetExists(options.dataset);
      }

      // Initialize Mastra and agent
      const spinner = ora('Initializing Mastra...').start();
      
      // Create memory with storage
      const storage = new LibSQLStore({
        url: 'file:./longmemeval.db',
      });

      const memory = new Memory({
        storage,
        options: {
          lastMessages: 20,
          semanticRecall: false,
          workingMemory: {
            enabled: false,
          },
        },
      });

      // Create agent with specified model and memory
      const modelProvider = getModelProvider(options.model);
      const agent = new Agent({
        name: 'longmemeval-agent',
        model: modelProvider,
        instructions: 'You are a helpful assistant. Answer questions based on the conversation history provided.',
        memory,
      });

      // Create a simple Mastra instance for the benchmark
      const mastra = new Mastra({
        agents: { longmemevalAgent: agent },
      });

      spinner.succeed('Mastra initialized');

      // Create benchmark config
      const benchmarkConfig: BenchmarkConfig = {
        dataset: options.dataset as any,
        model: options.model,
        memoryConfig: options.memoryConfig as any,
        outputDir: options.output,
      };

      // Initialize runner
      const runner = new BenchmarkRunner({
        mastra,
        agent,
        outputDir: options.output,
      });

      // Run benchmark
      if (options.subset) {
        console.log(chalk.yellow(`Running on subset of ${options.subset} questions\n`));
        // TODO: Implement subset functionality
      }

      const metrics = await runner.run(benchmarkConfig);
      
    } catch (error) {
      console.error(chalk.red('\nError:'), error);
      process.exit(1);
    }
  });

// Evaluate command
program
  .command('evaluate')
  .description('Evaluate existing results')
  .requiredOption('-r, --results <file>', 'Results file (JSONL format)')
  .requiredOption('-d, --dataset <dataset>', 'Dataset used for questions')
  .action(async (options) => {
    try {
      console.log(chalk.blue('\n📊 Evaluating Results\n'));

      const loader = new DatasetLoader();
      const questions = await loader.loadDataset(options.dataset);
      
      // Load results
      const resultsContent = await readFile(options.results, 'utf-8');
      const results: EvaluationResult[] = resultsContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      // Calculate metrics
      const evaluator = new QAEvaluator();
      const metrics = evaluator.calculateMetrics(results);

      // Print metrics
      console.log(chalk.bold('Overall Accuracy:'), chalk.yellow(`${(metrics.overall_accuracy * 100).toFixed(2)}%`));
      console.log(chalk.bold('Total Questions:'), metrics.total_questions);
      console.log(chalk.bold('Correct Answers:'), metrics.correct_answers);
      
      console.log(chalk.bold('\nAccuracy by Question Type:'));
      for (const [type, typeMetrics] of Object.entries(metrics.accuracy_by_type)) {
        const { correct, total, accuracy } = typeMetrics;
        console.log(
          chalk.gray(`  ${type}:`),
          chalk.yellow(`${(accuracy * 100).toFixed(2)}%`),
          chalk.gray(`(${correct}/${total})`)
        );
      }

    } catch (error) {
      console.error(chalk.red('\nError:'), error);
      process.exit(1);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show dataset statistics')
  .requiredOption('-d, --dataset <dataset>', 'Dataset to analyze')
  .action(async (options) => {
    try {
      console.log(chalk.blue('\n📈 Dataset Statistics\n'));

      const loader = new DatasetLoader();
      const stats = await loader.getDatasetStats(options.dataset);

      console.log(chalk.bold('Total Questions:'), stats.totalQuestions);
      console.log(chalk.bold('Abstention Questions:'), stats.abstentionQuestions);
      console.log(chalk.bold('Avg Sessions per Question:'), stats.avgSessionsPerQuestion.toFixed(2));
      console.log(chalk.bold('Avg Turns per Session:'), stats.avgTurnsPerSession.toFixed(2));
      console.log(chalk.bold('Total Tokens (estimate):'), stats.totalTokensEstimate.toLocaleString());

      console.log(chalk.bold('\nQuestions by Type:'));
      for (const [type, count] of Object.entries(stats.questionsByType)) {
        console.log(chalk.gray(`  ${type}:`), count);
      }

    } catch (error) {
      console.error(chalk.red('\nError:'), error);
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('Generate report from benchmark results')
  .requiredOption('-r, --results <dir>', 'Results directory')
  .action(async (options) => {
    try {
      console.log(chalk.blue('\n📄 Generating Report\n'));

      // List all runs in the results directory
      const runs = await readdir(options.results);
      const runDirs = runs.filter(r => r.startsWith('run_'));

      if (runDirs.length === 0) {
        console.log(chalk.yellow('No benchmark runs found in the results directory'));
        return;
      }

      console.log(chalk.bold(`Found ${runDirs.length} benchmark runs:\n`));

      // Load and display metrics for each run
      for (const runDir of runDirs) {
        const metricsPath = join(options.results, runDir, 'metrics.json');
        
        try {
          const metricsContent = await readFile(metricsPath, 'utf-8');
          const metrics = JSON.parse(metricsContent);

          console.log(chalk.bold(`Run: ${runDir}`));
          console.log(chalk.gray(`  Timestamp: ${metrics.timestamp}`));
          console.log(chalk.gray(`  Dataset: ${metrics.config.dataset}`));
          console.log(chalk.gray(`  Model: ${metrics.config.model}`));
          console.log(chalk.gray(`  Memory Config: ${metrics.config.memoryConfig}`));
          console.log(chalk.yellow(`  Overall Accuracy: ${(metrics.overall_accuracy * 100).toFixed(2)}%`));
          console.log();
        } catch (error) {
          console.log(chalk.red(`  Error loading metrics: ${error}`));
        }
      }

    } catch (error) {
      console.error(chalk.red('\nError:'), error);
      process.exit(1);
    }
  });

// Helper function to get model provider
function getModelProvider(model: string) {
  // Map model names to providers
  if (model.startsWith('gpt-')) {
    return openai(model);
  }
  
  // Add more providers as needed
  throw new Error(`Unsupported model: ${model}. Please configure the model provider.`);
}

// Helper function to ensure dataset exists
async function ensureDatasetExists(dataset: string) {
  const dataDir = join(process.cwd(), 'data');
  const datasetPath = join(dataDir, `${dataset}.json`);
  
  // Check if dataset exists and is valid (> 1MB)
  if (existsSync(datasetPath)) {
    try {
      const stats = statSync(datasetPath);
      if (stats.size > 1000000) {
        return; // Dataset exists and is valid
      }
    } catch (error) {
      // File exists but can't get stats, continue to download
    }
  }
  
  // Dataset missing or invalid, need to download
  console.log(chalk.yellow(`Dataset ${dataset} not found or invalid.\n`));
  
  // Check for HuggingFace token
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
  if (!token) {
    console.log(chalk.red('Error: HuggingFace token required to download datasets.\n'));
    console.log(chalk.gray('1. Get your token from:'));
    console.log(chalk.cyan('   https://huggingface.co/settings/tokens\n'));
    console.log(chalk.gray('2. Set it as an environment variable:'));
    console.log(chalk.cyan('   export HF_TOKEN=your_token_here\n'));
    console.log(chalk.gray('3. Run the benchmark again\n'));
    console.log(chalk.blue('Alternative: Download manually from Google Drive'));
    console.log(chalk.gray('See DOWNLOAD_GUIDE.md for instructions'));
    process.exit(1);
  }
  
  console.log(chalk.blue('Downloading dataset...\n'));
  
  try {
    // Run the download script
    execSync('pnpm download', { stdio: 'inherit' });
    
    // Verify download succeeded
    if (!existsSync(datasetPath) || statSync(datasetPath).size < 1000000) {
      throw new Error('Dataset download failed or file is invalid');
    }
    
    console.log(chalk.green('\n✅ Dataset downloaded successfully!\n'));
  } catch (error) {
    console.error(chalk.red('\nError downloading dataset:'), error);
    console.log(chalk.yellow('\nPlease download the dataset manually.'));
    console.log(chalk.gray('See DOWNLOAD_GUIDE.md for instructions'));
    process.exit(1);
  }
}

program.parse();