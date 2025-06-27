#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectBuilder } from './lib/scaffolding/project-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('smoke-test')
  .description('Manually test Mastra releases by scaffolding projects')
  .option('--alpha', 'Test alpha releases')
  .option('--latest', 'Test latest published packages')
  .option('--local', 'Test local changes (current branch)')
  .option('--version <version>', 'Test specific version')
  .option('--skip-build', 'Skip building local packages')
  .option('--name <name>', 'Project name (default: smoke-test-{mode}-{timestamp})')
  .action(async (options) => {
    console.log(chalk.bold.cyan('🧪 Mastra Manual Test Environment\n'));

    try {
      // Check for existing smoke test projects
      // Smoke test projects are created in monorepo-root/maintainer-tools/test-projects/
      const monorepoRoot = path.join(__dirname, '../../..');
      const testProjectsDir = path.join(monorepoRoot, 'maintainer-tools', 'test-projects');
      if (await fs.pathExists(testProjectsDir)) {
        const dirs = await fs.readdir(testProjectsDir);
        const smokeProjects = dirs
          .filter(dir => dir.startsWith('smoke-test-'))
          .sort((a, b) => {
            // Sort by directory name (which includes ISO timestamp) in descending order
            return b.localeCompare(a);
          });

        if (smokeProjects.length > 0) {
          const { resumeOrNew } = await inquirer.prompt([
            {
              type: 'list',
              name: 'resumeOrNew',
              message: 'What would you like to do?',
              choices: [
                { name: '🔄 Resume existing smoke test project', value: 'resume' },
                { name: '🆕 Create new smoke test project', value: 'new' }
              ]
            }
          ]);

          if (resumeOrNew === 'resume') {
            // Show list of existing projects
            const { selectedProject } = await inquirer.prompt([
              {
                type: 'list',
                name: 'selectedProject',
                message: 'Select a project to resume:',
                choices: smokeProjects.slice(0, 10).map(proj => {
                  // Extract mode from project name
                  const parts = proj.split('-');
                  const mode = parts[2]; // smoke-test-{mode}-{timestamp}
                  return {
                    name: `${proj} (${mode} mode)`,
                    value: proj
                  };
                }),
                pageSize: 10
              }
            ]);

            const projectPath = path.join(testProjectsDir, selectedProject);
            console.log(chalk.green(`\n✅ Resuming project: ${selectedProject}`));
            console.log(chalk.cyan('\n🚀 Starting playground...\n'));

            // Start dev server for existing project
            try {
              const devProcess = execa('pnpm', ['dev'], { 
                cwd: projectPath,
                stdio: 'inherit'
              });

              // Wait for server to start
              setTimeout(() => {
                console.log(chalk.green('\n✨ Playground is ready!'));
              }, 3000);

              await devProcess;
            } catch (error) {
              if (error.signal === 'SIGINT') {
                console.log(chalk.yellow('\n\n👋 Playground stopped'));
              } else {
                console.error(chalk.red('\nError starting playground:'), error.message);
              }
            }
            
            return; // Exit early
          }
          // Otherwise continue with new project flow
        }
      }

      // Determine test mode
      let mode: 'alpha' | 'latest' | 'local' | 'custom';
      let version: string | undefined;

      if (options.alpha) {
        mode = 'alpha';
      } else if (options.latest) {
        mode = 'latest';
      } else if (options.local) {
        mode = 'local';
      } else if (options.version) {
        mode = 'custom';
        version = options.version;
      } else {
        // Interactive mode
        const { selectedMode } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedMode',
            message: 'What version would you like to test?',
            choices: [
              { name: '📦 Latest published packages', value: 'latest' },
              { name: '🚀 Alpha releases (experimental)', value: 'alpha' },
              { name: '💻 Local changes (current branch)', value: 'local' },
              { name: '🎯 Custom version', value: 'custom' }
            ]
          }
        ]);
        mode = selectedMode;

        if (mode === 'custom') {
          const { customVersion } = await inquirer.prompt([
            {
              type: 'input',
              name: 'customVersion',
              message: 'Enter version to test (e.g., 0.1.45):',
              validate: (input) => input.length > 0 || 'Version is required'
            }
          ]);
          version = customVersion;
        }
      }

      // Configure the test project
      const { projectConfig } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'projectConfig',
          message: 'Select project features to include:',
          choices: [
            { name: '🤖 Agent with tools', value: 'agent', checked: true },
            { name: '🔄 Workflows', value: 'workflow', checked: true },
            { name: '💾 Memory persistence', value: 'memory', checked: true },
            { name: '🔌 MCP integration', value: 'mcp', checked: false },
            { name: '📊 Vector store', value: 'vector', checked: false }
          ]
        }
      ]);

      // Check which API keys are available
      const availableKeys = ProjectBuilder.getAvailableApiKeys();
      
      const { aiProvider } = await inquirer.prompt([
        {
          type: 'list',
          name: 'aiProvider',
          message: 'Select AI provider:',
          choices: [
            { 
              name: `OpenAI${availableKeys.openai ? ' ✅' : ' (requires API key)'}`, 
              value: 'openai' 
            },
            { 
              name: `Anthropic (Claude)${availableKeys.anthropic ? ' ✅' : ' (requires API key)'}`, 
              value: 'anthropic' 
            },
            { 
              name: `Groq${availableKeys.groq ? ' ✅' : ' (requires API key)'}`, 
              value: 'groq' 
            },
            { 
              name: `Google${availableKeys.google ? ' ✅' : ' (requires API key)'}`, 
              value: 'google' 
            }
          ],
          default: availableKeys.anthropic ? 'anthropic' : (availableKeys.openai ? 'openai' : 'anthropic')
        }
      ]);

      // Build local packages if needed
      if (mode === 'local' && !options.skipBuild) {
        const buildSpinner = ora('Building local packages...').start();
        try {
          // Use explicit workspace directory to prevent individual lockfiles
          const monorepoRoot = path.join(__dirname, '../../..');
          await execa('pnpm', ['--dir', monorepoRoot, 'run', 'build:packages'], { 
            cwd: monorepoRoot,
            stdio: 'pipe',
            env: {
              ...process.env,
              // Ensure we're in workspace context
              PNPM_HOME: undefined
            }
          });
          buildSpinner.succeed('Local packages built');
        } catch (error) {
          buildSpinner.fail('Failed to build local packages');
          console.error(chalk.red(error.message));
          const { continueAnyway } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueAnyway',
              message: 'Continue anyway?',
              default: false
            }
          ]);
          if (!continueAnyway) {
            process.exit(1);
          }
        }
      }

      // Create test project
      const projectName = options.name || `smoke-test-${mode}-${Date.now()}`;
      const createSpinner = ora('Creating test project...').start();
      const builder = new ProjectBuilder();
      const projectPath = await builder.createSmokeTestProject(mode, version, projectConfig, aiProvider);
      createSpinner.succeed('Test project created');

      console.log(chalk.green(`\n✅ Test environment ready at: ${projectPath}`));

      // Display project info
      console.log(chalk.cyan('\n📋 Project Details:'));
      console.log(`  • Mode: ${chalk.bold(mode)}`);
      console.log(`  • Version: ${chalk.bold(version || mode)}`);
      console.log(`  • Features: ${projectConfig.join(', ')}`);
      console.log(`  • AI Provider: ${aiProvider}`);
      console.log(`  • Location: ${projectPath}`);

      // Check if dependencies were installed successfully
      const checkSpinner = ora('Verifying installation...').start();
      try {
        // Check if node_modules exists
        const nodeModulesExists = await fs.pathExists(path.join(projectPath, 'node_modules'));
        if (!nodeModulesExists) {
          checkSpinner.fail('Dependencies not installed');
          console.log(chalk.yellow('\nPlease run `pnpm install` in the project directory'));
        } else {
          // Run a quick type check
          const { stdout } = await execa('npx', ['tsc', '--noEmit'], { 
            cwd: projectPath,
            reject: false
          });
          checkSpinner.succeed('Installation verified');
        }
      } catch (error) {
        checkSpinner.warn('Could not verify installation');
      }

      // Automatically start dev server (no prompt)
      console.log(chalk.cyan('\n🚀 Starting playground...\n'));

      // Check for API key
      const envPath = path.join(projectPath, '.env');
      const envContent = await fs.readFile(envPath, 'utf-8');
      const hasApiKey = envContent.includes('_API_KEY=your-key-here');
      
      // Check if the selected provider has an API key in the environment
      const providerHasKey = {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
        google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
      }[aiProvider];
      
      if (hasApiKey && !providerHasKey) {
        console.log(chalk.yellow('⚠️  Warning: Please set your API key in .env file'));
        console.log(chalk.yellow(`   Edit: ${envPath}\n`));
      } else if (providerHasKey) {
        console.log(chalk.green(`✅ Using ${aiProvider.toUpperCase()} API key from environment\n`));
      }

      // Start dev server
      try {
        const devProcess = execa('pnpm', ['dev'], { 
          cwd: projectPath,
          stdio: 'inherit'
        });

        // Wait for server to start
        setTimeout(() => {
          console.log(chalk.green('\n✨ Playground is ready!'));
        }, 3000);

        await devProcess;
      } catch (error) {
        if (error.signal === 'SIGINT') {
          console.log(chalk.yellow('\n\n👋 Playground stopped'));
        } else {
          console.error(chalk.red('\nError starting playground:'), error.message);
        }
      }

    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();