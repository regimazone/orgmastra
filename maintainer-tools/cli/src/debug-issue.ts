#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { GitHubIssueFetcher } from './lib/github/issue-fetcher.js';
import { ProjectBuilder } from './lib/scaffolding/project-builder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('debug-issue')
  .description('Debug GitHub issues with an interactive TUI agent')
  .argument('[issue]', 'GitHub issue number or URL')
  .option('--repo <repo>', 'GitHub repository (owner/repo)', 'mastra-ai/mastra')
  .action(async (issue, options) => {
    console.log(chalk.bold.cyan('🔍 Mastra Issue Debugger\n'));

    try {
      // Check if gh CLI is available
      try {
        await execa('gh', ['--version']);
      } catch {
        console.error(chalk.red('Error: GitHub CLI (gh) is required. Install with: brew install gh'));
        console.error(chalk.yellow('Then authenticate with: gh auth login'));
        process.exit(1);
      }

      // Check if gh is authenticated
      try {
        await execa('gh', ['auth', 'status']);
      } catch {
        console.error(chalk.red('Error: GitHub CLI is not authenticated. Run: gh auth login'));
        process.exit(1);
      }

      // Initialize GitHub issue fetcher (will use gh CLI)
      const fetcher = new GitHubIssueFetcher('gh-cli', options.repo);
      const builder = new ProjectBuilder();
      
      // Check for existing debug projects
      // Try to find the test-projects directory by looking up from current directory
      let testProjectsDir = '';
      let currentDir = process.cwd();
      
      // Look for maintainer-tools/test-projects in current dir and up to 5 levels up
      for (let i = 0; i < 5; i++) {
        const candidatePath = path.join(currentDir, 'maintainer-tools', 'test-projects');
        if (fs.existsSync(candidatePath)) {
          testProjectsDir = candidatePath;
          break;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // Reached root
        currentDir = parentDir;
      }
      
      let existingProjects: Array<{ name: string; issueNumber: number; path: string; createdAt?: Date }> = [];
      
      if (testProjectsDir) {
        try {
          const entries = await fs.readdir(testProjectsDir);
        existingProjects = entries
          .filter(name => name.startsWith('debug-issue-'))
          .map(name => {
            const match = name.match(/debug-issue-(\d+)/);
            if (match) {
              const projectPath = path.join(testProjectsDir, name);
              let createdAt: Date | undefined;
              try {
                const stats = fs.statSync(projectPath);
                createdAt = stats.birthtime;
              } catch {}
              return {
                name,
                issueNumber: parseInt(match[1]),
                path: projectPath,
                createdAt
              };
            }
            return null;
          })
          .filter(Boolean) as any;
        } catch {
          // No existing projects
        }
      }
      
      // Parse issue number
      let issueNumber: number;
      let projectPath: string;
      
      if (!issue && existingProjects.length > 0) {
        // Ask whether to start new or resume existing
        const { debugMode } = await inquirer.prompt([
          {
            type: 'list',
            name: 'debugMode',
            message: 'What would you like to do?',
            choices: [
              { name: '🆕 Start new debug session', value: 'new' },
              { name: '📂 Resume existing debug session', value: 'resume' }
            ]
          }
        ]);
        
        if (debugMode === 'resume') {
          // Show list of existing projects
          const { selectedProject } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedProject',
              message: 'Select a debug session to resume:',
              choices: existingProjects.map(proj => ({
                name: `Issue #${proj.issueNumber}${proj.createdAt ? ` - Created ${proj.createdAt.toLocaleDateString()}` : ''}`,
                value: proj
              }))
            }
          ]);
          
          projectPath = selectedProject.path;
          issueNumber = selectedProject.issueNumber;
          
          console.log(chalk.green(`\n✅ Resuming debug session for issue #${issueNumber}`));
          console.log(chalk.gray(`Project: ${projectPath}`));
          
          // Start the playground automatically
          console.log(chalk.cyan('\n🎯 Starting Mastra playground...\n'));
          console.log(chalk.gray('Press Ctrl+C to stop the server\n'));

          try {
            const devProcess = execa('pnpm', ['dev'], { 
              cwd: projectPath,
              stdio: 'inherit'
            });

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
        // Otherwise continue with new session flow
      }
      
      if (!issue) {
        // Interactive mode - show options
        const { selectionMode } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectionMode',
            message: 'How would you like to select an issue?',
            choices: [
              { name: '🔢 Enter issue number', value: 'number' },
              { name: '🔍 Search for issues', value: 'search' },
              { name: '📋 Browse recent issues', value: 'recent' },
              { name: '👤 My assigned issues', value: 'assigned' },
              { name: '🏷️  Filter by label', value: 'label' }
            ]
          }
        ]);

        switch (selectionMode) {
          case 'number':
            const { inputNumber } = await inquirer.prompt([
              {
                type: 'input',
                name: 'inputNumber',
                message: 'Enter issue number:',
                validate: (input) => {
                  const num = parseInt(input);
                  return !isNaN(num) && num > 0 ? true : 'Please enter a valid issue number';
                }
              }
            ]);
            issueNumber = parseInt(inputNumber);
            break;

          case 'search':
            const { searchQuery } = await inquirer.prompt([
              {
                type: 'input',
                name: 'searchQuery',
                message: 'Enter search query:',
                validate: (input) => input.trim().length > 0 || 'Please enter a search query'
              }
            ]);
            
            const searchSpinner = ora('Searching issues...').start();
            const searchResults = await fetcher.searchIssues(searchQuery);
            searchSpinner.stop();

            if (searchResults.length === 0) {
              console.log(chalk.yellow('No issues found matching your search.'));
              process.exit(0);
            }

            const { searchedIssue } = await inquirer.prompt([
              {
                type: 'list',
                name: 'searchedIssue',
                message: `Found ${searchResults.length} issues:`,
                choices: searchResults.slice(0, 20).map(i => ({
                  name: `#${i.number} - ${i.title}`,
                  value: i.number
                })),
                pageSize: 15
              }
            ]);
            issueNumber = searchedIssue;
            break;

          case 'recent':
            const recentSpinner = ora('Fetching recent issues...').start();
            const recentIssues = await fetcher.getRecentIssues(30);
            recentSpinner.stop();

            const { recentIssue } = await inquirer.prompt([
              {
                type: 'list',
                name: 'recentIssue',
                message: 'Select an issue:',
                choices: recentIssues.map(i => ({
                  name: `#${i.number} - ${i.title}`,
                  value: i.number
                })),
                pageSize: 15
              }
            ]);
            issueNumber = recentIssue;
            break;

          case 'assigned':
            const assignedSpinner = ora('Fetching your assigned issues...').start();
            const assignedIssues = await fetcher.getAssignedIssues();
            assignedSpinner.stop();

            if (assignedIssues.length === 0) {
              console.log(chalk.yellow('No issues assigned to you.'));
              process.exit(0);
            }

            const { assignedIssue } = await inquirer.prompt([
              {
                type: 'list',
                name: 'assignedIssue',
                message: `Your assigned issues (${assignedIssues.length}):`,
                choices: assignedIssues.map(i => ({
                  name: `#${i.number} - ${i.title}`,
                  value: i.number
                })),
                pageSize: 15
              }
            ]);
            issueNumber = assignedIssue;
            break;

          case 'label':
            const { labelName } = await inquirer.prompt([
              {
                type: 'input',
                name: 'labelName',
                message: 'Enter label name (e.g., bug, enhancement):',
                validate: (input) => input.trim().length > 0 || 'Please enter a label'
              }
            ]);

            const labelSpinner = ora(`Fetching issues with label '${labelName}'...`).start();
            const labeledIssues = await fetcher.getIssuesByLabel(labelName);
            labelSpinner.stop();

            if (labeledIssues.length === 0) {
              console.log(chalk.yellow(`No issues found with label '${labelName}'.`));
              process.exit(0);
            }

            const { labeledIssue } = await inquirer.prompt([
              {
                type: 'list',
                name: 'labeledIssue',
                message: `Issues with label '${labelName}' (${labeledIssues.length}):`,
                choices: labeledIssues.map(i => ({
                  name: `#${i.number} - ${i.title}`,
                  value: i.number
                })),
                pageSize: 15
              }
            ]);
            issueNumber = labeledIssue;
            break;
        }
      } else if (issue.includes('github.com')) {
        // Extract from URL
        const parsedNumber = fetcher.parseIssueUrl(issue);
        if (!parsedNumber) {
          throw new Error('Invalid GitHub issue URL');
        }
        issueNumber = parsedNumber;
      } else {
        issueNumber = parseInt(issue);
      }

      // Fetch issue details
      const spinner = ora('Fetching issue details...').start();
      const issueData = await fetcher.getIssue(issueNumber);
      const comments = await fetcher.getIssueComments(issueNumber);
      spinner.succeed(`Loaded issue #${issueNumber}: ${issueData.title}`);

      // Add comments to issueData so they're included when creating the project
      issueData.comments_data = comments;

      // Create debug project
      const createSpinner = ora('Creating debug project...').start();
      projectPath = await builder.createDebugProject(issueNumber, issueData);
      
      createSpinner.succeed('Debug project created');
      
      console.log(chalk.green(`\n✅ Debug environment ready at: ${projectPath}`));

      // Check if API key is set
      const hasApiKey = ProjectBuilder.getAvailableApiKeys().anthropic;
      if (!hasApiKey) {
        console.log(chalk.yellow('⚠️  Note: Set ANTHROPIC_API_KEY in your environment or .env file\n'));
      }

      // Automatically start the playground
      console.log(chalk.cyan('\n🎯 Starting Mastra playground...\n'));
      console.log(chalk.gray('The debug agent has access to:'));
      console.log(chalk.gray('  • File reading and searching'));
      console.log(chalk.gray('  • Command execution'));
      console.log(chalk.gray('  • Code pattern matching'));
      console.log(chalk.gray(`  • Full context about issue #${issueNumber}\n`));
      console.log(chalk.gray('Press Ctrl+C to stop the server\n'));

      try {
        // Start the dev server
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