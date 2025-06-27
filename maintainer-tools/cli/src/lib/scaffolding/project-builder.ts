import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ProjectConfig {
  name: string;
  path: string;
  mode: 'alpha' | 'latest' | 'local' | 'custom';
  version?: string;
  includeAgent?: boolean;
  includeWorkflow?: boolean;
  includeMemory?: boolean;
  aiProvider?: 'openai' | 'anthropic' | 'groq' | 'google';
}

export class ProjectBuilder {
  private rootDir: string;

  constructor() {
    // Navigate from lib/scaffolding to monorepo root
    this.rootDir = path.join(__dirname, '../../../../..'); // Points to monorepo root
  }

  // Helper to check which API keys are available
  static getAvailableApiKeys(): { openai: boolean; anthropic: boolean; groq: boolean; google: boolean } {
    return {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    };
  }

  async createProject(config: ProjectConfig): Promise<void> {
    // Create project directory
    await fs.ensureDir(config.path);

    // Create package.json
    await this.createPackageJson(config);

    // Create TypeScript config
    await this.createTsConfig(config);

    // Create .env file
    await this.createEnvFile(config);

    // Create .gitignore
    await this.createGitignore(config);

    // Create .npmrc to prevent workspace detection
    await this.createNpmrc(config);

    // Create src structure
    await this.createSrcStructure(config);

    // Install dependencies
    await this.installDependencies(config);
  }

  private async createPackageJson(config: ProjectConfig): Promise<void> {
    const packageJson = {
      name: config.name,
      version: '0.0.1',
      type: 'module',
      scripts: {
        dev: 'mastra dev',
        build: 'mastra build',
        start: 'mastra start',
      },
      engines: {
        node: '>=20.9.0',
      },
      dependencies: {
        '@mastra/core': await this.resolvePackageVersion(config, '@mastra/core'),
        zod: '^3.25.67',
        execa: '^8.0.1',
        glob: '^10.3.10',
      },
      devDependencies: {
        mastra: await this.resolvePackageVersion(config, 'mastra'),
        typescript: '^5.8.3',
        '@types/node': '^22.15.29',
      },
    };

    // Add AI SDK based on provider
    if (config.aiProvider) {
      const aiSdkMap = {
        openai: '@ai-sdk/openai',
        anthropic: '@ai-sdk/anthropic',
        groq: '@ai-sdk/groq',
        google: '@ai-sdk/google',
      };
      packageJson.dependencies[aiSdkMap[config.aiProvider]] = 'latest';
    }

    // Add memory dependencies if needed
    if (config.includeMemory) {
      packageJson.dependencies['@mastra/memory'] = await this.resolvePackageVersion(config, '@mastra/memory');
      packageJson.dependencies['@mastra/libsql'] = await this.resolvePackageVersion(config, '@mastra/libsql');
    }

    // Add MCP dependency for debug projects
    if (config.name.startsWith('debug-issue-')) {
      packageJson.dependencies['@mastra/mcp'] = await this.resolvePackageVersion(config, '@mastra/mcp');
    }

    await fs.writeJson(path.join(config.path, 'package.json'), packageJson, { spaces: 2 });
  }

  private async resolvePackageVersion(config: ProjectConfig, packageName?: string): Promise<string> {
    switch (config.mode) {
      case 'alpha':
        // For alpha, just use the 'alpha' tag which npm will resolve
        return 'alpha';
      case 'latest':
        return 'latest';
      case 'custom':
        return config.version || 'latest';
      case 'local':
        // For local mode, we install latest versions first, then create symlinks
        // This avoids workspace dependency conflicts
        return 'latest';
      default:
        return 'latest';
    }
  }

  private async createTsConfig(config: ProjectConfig): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        outDir: 'dist',
      },
      include: ['src/**/*'],
    };

    await fs.writeJson(path.join(config.path, 'tsconfig.json'), tsConfig, { spaces: 2 });
  }

  private async createEnvFile(config: ProjectConfig): Promise<void> {
    // Check which API keys are already in the environment
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasGroq = !!process.env.GROQ_API_KEY;
    const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // Build env file content, only including placeholders for missing keys
    let envContent = '# AI Provider API Keys\n';

    // For the selected provider, check if key exists
    if (config.aiProvider === 'openai' && !hasOpenAI) {
      envContent += 'OPENAI_API_KEY=your-key-here\n';
    } else if (config.aiProvider === 'openai' && hasOpenAI) {
      envContent += '# OPENAI_API_KEY already set in environment\n';
    } else {
      envContent += '# OPENAI_API_KEY=\n';
    }

    if (config.aiProvider === 'anthropic' && !hasAnthropic) {
      envContent += 'ANTHROPIC_API_KEY=your-key-here\n';
    } else if (config.aiProvider === 'anthropic' && hasAnthropic) {
      envContent += '# ANTHROPIC_API_KEY already set in environment\n';
    } else {
      envContent += '# ANTHROPIC_API_KEY=\n';
    }

    if (config.aiProvider === 'groq' && !hasGroq) {
      envContent += 'GROQ_API_KEY=your-key-here\n';
    } else if (config.aiProvider === 'groq' && hasGroq) {
      envContent += '# GROQ_API_KEY already set in environment\n';
    } else {
      envContent += '# GROQ_API_KEY=\n';
    }

    if (config.aiProvider === 'google' && !hasGoogle) {
      envContent += 'GOOGLE_GENERATIVE_AI_API_KEY=your-key-here\n';
    } else if (config.aiProvider === 'google' && hasGoogle) {
      envContent += '# GOOGLE_GENERATIVE_AI_API_KEY already set in environment\n';
    } else {
      envContent += '# GOOGLE_GENERATIVE_AI_API_KEY=\n';
    }

    envContent += '\n# Other configuration\n# DATABASE_URL=\n';

    await fs.writeFile(path.join(config.path, '.env'), envContent);
  }

  private async createGitignore(config: ProjectConfig): Promise<void> {
    const gitignore = `node_modules/
dist/
.env
.env.local
.mastra/
mastra.db
mastra.db-*
.DS_Store
`;

    await fs.writeFile(path.join(config.path, '.gitignore'), gitignore);
  }

  private async createNpmrc(config: ProjectConfig): Promise<void> {
    // Prevent pnpm from treating this as part of the monorepo workspace
    const npmrcContent = `link-workspace-packages=false
shared-workspace-lockfile=false
`;

    await fs.writeFile(path.join(config.path, '.npmrc'), npmrcContent);
  }

  private async createSrcStructure(config: ProjectConfig): Promise<void> {
    const srcPath = path.join(config.path, 'src');
    const mastraPath = path.join(srcPath, 'mastra');

    await fs.ensureDir(path.join(mastraPath, 'agents'));
    await fs.ensureDir(path.join(mastraPath, 'workflows'));
    
    // Only create tools directory for non-debug projects
    if (!config.name.startsWith('debug-issue-')) {
      await fs.ensureDir(path.join(mastraPath, 'tools'));
    }

    // Create main Mastra configuration
    await this.createMastraIndex(config);

    // Create agent if requested
    if (config.includeAgent) {
      await this.createAgent(config);
      // Only create custom tools for non-debug projects
      if (!config.name.startsWith('debug-issue-')) {
        await this.createTools(config);
      }
    }

    // Create workflow if requested
    if (config.includeWorkflow) {
      await this.createWorkflow(config);
    }
  }

  private async createMastraIndex(config: ProjectConfig): Promise<void> {
    const imports: string[] = [`import { Mastra } from '@mastra/core';`];

    const exports: string[] = [];

    if (config.includeMemory) {
      imports.push(`import { LibSQLStore } from '@mastra/libsql';`);
    }

    if (config.includeAgent) {
      if (config.name.startsWith('debug-issue-')) {
        imports.push(`import { debugAgent } from './agents/index.js';`);
        exports.push(`  agents: { debugAgent },`);
      } else {
        imports.push(`import { agent } from './agents/index.js';`);
        exports.push(`  agents: { agent },`);
      }
    }

    if (config.includeWorkflow) {
      if (config.name.startsWith('debug-issue-')) {
        imports.push(`import { reproduceIssueWorkflow } from './workflows/index.js';`);
        exports.push(`  workflows: { reproduceIssueWorkflow },`);
      } else {
        imports.push(`import { debugWorkflow } from './workflows/index.js';`);
        exports.push(`  workflows: { debugWorkflow },`);
      }
    }

    const content = `${imports.join('\n')}

export const mastra = new Mastra({
${exports.join('\n')}
${
  config.includeMemory
    ? `  storage: new LibSQLStore({
    url: "file:../mastra.db",
  }),`
    : ''
}
});
`;

    await fs.writeFile(path.join(config.path, 'src/mastra/index.ts'), content);
  }

  private async createAgent(config: ProjectConfig): Promise<void> {
    const aiSdkImportMap = {
      openai: `import { openai } from '@ai-sdk/openai';`,
      anthropic: `import { anthropic } from '@ai-sdk/anthropic';`,
      groq: `import { groq } from '@ai-sdk/groq';`,
      google: `import { google } from '@ai-sdk/google';`,
    };

    const modelMap = {
      openai: `openai('gpt-4o')`,
      anthropic: `anthropic('claude-4-sonnet-20250514')`,
      groq: `groq('llama-3.3-70b-versatile')`,
      google: `google('gemini-pro')`,
    };

    // For debug projects, use MCP servers
    if (config.name.startsWith('debug-issue-')) {
      // Read issue details
      let issueContext = '';
      try {
        const issueDetailsPath = path.join(config.path, 'ISSUE_DETAILS.md');
        if (await fs.pathExists(issueDetailsPath)) {
          issueContext = await fs.readFile(issueDetailsPath, 'utf-8');
          // Escape backticks in the issue context to prevent syntax errors
          issueContext = issueContext.replace(/`/g, '\\`');
        }
      } catch {
        // Ignore if file doesn't exist yet
      }

      // Get absolute path to monorepo root
      const monorepoRoot = path.resolve(config.path, '../../..');
      
      const content = `import { Agent } from '@mastra/core/agent';
${config.aiProvider ? aiSdkImportMap[config.aiProvider] : ''}
${
  config.includeMemory
    ? `import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';`
    : ''
}
import { MCPClient } from '@mastra/mcp';

// Initialize MCP client with filesystem server and Mastra docs
const mcp = new MCPClient({
  servers: {
    filesystem: {
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        '.', // Current project directory
        '${monorepoRoot}' // Absolute path to monorepo root
      ]
    },
    mastraDocs: {
      command: 'npx',
      args: ['-y', '@mastra/mcp-docs-server']
    }
  }
});

// Initialize the agent with MCP tools
const initDebugAgent = async () => {
  const tools = await mcp.getTools();
  
  return new Agent({
    name: 'Debug Agent',
    instructions: \`You are an expert debugging assistant for the Mastra framework. You have deep knowledge of:
- Mastra core architecture (agents, tools, workflows, memory)
- TypeScript/JavaScript best practices
- Node.js ecosystem and debugging techniques
- Common issues and their solutions

Your debugging approach:
1. First, understand the issue thoroughly by reading the issue details
2. ALWAYS start by listing directory contents to understand the structure (use filesystem.list)
3. Navigate through directories by listing their contents before searching
4. Once you find the right location, read specific files
5. Only use filesystem.search when you need to find specific content across many files
6. Run commands to reproduce or investigate the issue
7. Suggest concrete fixes with code examples

Example workflow:
- List packages: filesystem.list({ path: "${monorepoRoot}/packages" })
- Explore a package: filesystem.list({ path: "${monorepoRoot}/packages/core/src" })
- Then read specific files once you know they exist

You have access to:
1. MCP filesystem tools to read/write files in:
   - Current directory (.) - this debug project where you can create reproduction code
   - Monorepo root (${monorepoRoot}) - to explore and understand the framework
2. Mastra documentation through the docs MCP server, which provides:
   - mastraDocs: Access to all Mastra documentation pages
   - mastraExamples: Code examples showing implementation patterns
   - mastraBlog: Technical blog posts and articles
   - mastraChanges: Package changelogs

Important paths:
- Current directory (.) - CREATE REPRODUCTION CODE HERE
- ${monorepoRoot}/packages/core - Main framework code
- ${monorepoRoot}/packages/cli - CLI and playground
- ${monorepoRoot}/packages/memory - Memory system
- ${monorepoRoot}/stores/ - Storage adapters
- ${monorepoRoot}/examples/ - Example projects

When debugging, you should:
1. Create minimal reproduction code in the current debug project (src/reproductions/)
2. Use the Mastra docs to understand correct API usage
3. Test your reproduction to verify the issue
4. When asked to create reproductions, use the filesystem MCP tools to write files

${issueContext ? 'Current issue context:\\n' + issueContext : 'No issue context available.'}\`,
    model: ${config.aiProvider ? modelMap[config.aiProvider] : 'undefined // TODO: Configure AI model'},
    tools,${
  config.includeMemory
    ? `
    memory: new Memory({
      storage: new LibSQLStore({
        url: "file:../mastra.db",
      })
    }),`
    : ''
}
  });
};

export const debugAgent = await initDebugAgent();
`;

      await fs.writeFile(path.join(config.path, 'src/mastra/agents/index.ts'), content);
      return;
    }

    // Original agent creation for non-debug projects
    const content = `import { Agent } from '@mastra/core/agent';
${config.aiProvider ? aiSdkImportMap[config.aiProvider] : ''}
${
  config.includeMemory
    ? `import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';`
    : ''
}

export const agent = new Agent({
  name: 'My Agent',
  instructions: 'You are a helpful AI assistant.',
  model: ${config.aiProvider ? modelMap[config.aiProvider] : 'undefined // TODO: Configure AI model'},${
  config.includeMemory
    ? `
  memory: new Memory({
    storage: new LibSQLStore({
      url: "file:../mastra.db",
    })
  }),`
    : ''
}
});
`;

    await fs.writeFile(path.join(config.path, 'src/mastra/agents/index.ts'), content);
  }

  private async createTools(config: ProjectConfig): Promise<void> {
    const content = `import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';
import { glob } from 'glob';

export const fileSystemTool = createTool({
  id: 'read-file',
  description: 'Read contents of a file',
  inputSchema: z.object({
    path: z.string().describe('File path to read'),
  }),
  outputSchema: z.object({
    content: z.string(),
    error: z.string().optional(),
  }),
  execute: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return { content };
    } catch (error) {
      return { content: '', error: error.message };
    }
  },
});

export const listFilesTool = createTool({
  id: 'list-files',
  description: 'List files and directories in a given path',
  inputSchema: z.object({
    path: z.string().default('.').describe('Directory path to list'),
    recursive: z.boolean().default(false).describe('List recursively'),
  }),
  outputSchema: z.object({
    files: z.array(z.object({
      name: z.string(),
      type: z.enum(['file', 'directory']),
      size: z.number().optional(),
    })),
    error: z.string().optional(),
  }),
  execute: async ({ path: dirPath, recursive }) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        let size: number | undefined;
        
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          size = stats.size;
        }
        
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file' as const,
          size,
        };
      }));
      
      return { files };
    } catch (error) {
      return { files: [], error: error.message };
    }
  },
});

export const echoTool = createTool({
  id: 'echo',
  description: 'Echo back a message',
  inputSchema: z.object({
    message: z.string().describe('Message to echo'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ message }) => {
    return { message };
  },
});

export const runCommandTool = createTool({
  id: 'run-command',
  description: 'Execute a shell command',
  inputSchema: z.object({
    command: z.string().describe('Command to execute'),
    cwd: z.string().optional().describe('Working directory'),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  }),
  execute: async ({ command, cwd }) => {
    try {
      const result = await execa(command, {
        shell: true,
        cwd: cwd,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode || 0,
      };
    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.exitCode || 1,
      };
    }
  },
});

export const searchCodeTool = createTool({
  id: 'search-code',
  description: 'Search for patterns in code files',
  inputSchema: z.object({
    pattern: z.string().describe('Search pattern or regex'),
    filePattern: z.string().default('**/*.{ts,js,tsx,jsx}').describe('File glob pattern'),
    directory: z.string().default('.').describe('Directory to search in'),
  }),
  outputSchema: z.object({
    matches: z.array(z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
    })),
  }),
  execute: async ({ pattern, filePattern, directory }) => {
    const files = await glob(filePattern, {
      cwd: directory,
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
    });
    
    const matches = [];
    const regex = new RegExp(pattern, 'gi');
    
    for (const file of files) {
      try {
        const fullPath = path.join(directory, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\\n');
        
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matches.push({
              file,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch {
        // Skip files that can't be read
      }
    }
    
    return { matches };
  },
});

export const grepTool = createTool({
  id: 'grep-files',
  description: 'Search file contents using grep-like functionality',
  inputSchema: z.object({
    pattern: z.string().describe('Search pattern (supports regex)'),
    path: z.string().default('.').describe('Path to search in'),
    includePattern: z.string().optional().describe('File pattern to include (e.g., "*.ts")'),
    excludePattern: z.string().optional().describe('File pattern to exclude'),
    maxResults: z.number().default(100).describe('Maximum number of results'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
      context: z.object({
        before: z.string().optional(),
        after: z.string().optional(),
      }).optional(),
    })),
    totalMatches: z.number(),
  }),
  execute: async ({ pattern, path: searchPath, includePattern, maxResults }) => {
    // Build file pattern
    const filePattern = includePattern || '**/*';
    const files = await glob(filePattern, {
      cwd: searchPath,
      ignore: ['node_modules/**', 'dist/**', '.git/**', '*.log', '*.lock'],
      nodir: true,
    });
    
    const results = [];
    let totalMatches = 0;
    const regex = new RegExp(pattern, 'gi');
    
    for (const file of files) {
      if (results.length >= maxResults) break;
      
      try {
        const fullPath = path.join(searchPath, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\\n');
        
        lines.forEach((line, index) => {
          if (results.length >= maxResults) return;
          
          if (regex.test(line)) {
            totalMatches++;
            results.push({
              file,
              line: index + 1,
              content: line.trim(),
              context: {
                before: lines[index - 1]?.trim(),
                after: lines[index + 1]?.trim(),
              },
            });
          }
        });
      } catch {
        // Skip files that can't be read
      }
    }
    
    return { results, totalMatches };
  },
});
`;

    await fs.writeFile(path.join(config.path, 'src/mastra/tools/index.ts'), content);
  }

  private async createWorkflow(config: ProjectConfig): Promise<void> {
    // For debug projects, create a reproduction workflow
    if (config.name.startsWith('debug-issue-')) {
      const content = `import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

import { mastra } from '../index.js';

const analyzeIssueWithAgent = createStep({
  id: 'analyze-issue-with-agent',
  description: 'Uses the debug agent to analyze the issue and create a reproduction strategy',
  inputSchema: z.object({}),
  outputSchema: z.object({
    analysis: z.string(),
    reproductionPlan: z.string(),
  }),
  execute: async () => {
    const agent = await mastra.getAgent('debugAgent');
    
    // Read issue details from file
    // When running in mastra dev, cwd is .mastra/output, so we need to go up to project root
    let issueDetails = '';
    try {
      // Try project root first (when running in mastra dev)
      const projectRoot = path.join(process.cwd(), '../..');
      const issueDetailsPath = path.join(projectRoot, 'ISSUE_DETAILS.md');
      issueDetails = await fs.readFile(issueDetailsPath, 'utf-8');
    } catch (error) {
      try {
        // Fallback to current directory (for testing or different runtime)
        const issueDetailsPath = path.join(process.cwd(), 'ISSUE_DETAILS.md');
        issueDetails = await fs.readFile(issueDetailsPath, 'utf-8');
      } catch (fallbackError) {
        console.error('Could not read issue details from either location:');
        console.error('- Project root (.mastra/output context):', path.join(process.cwd(), '../..', 'ISSUE_DETAILS.md'));
        console.error('- Current directory:', path.join(process.cwd(), 'ISSUE_DETAILS.md'));
        console.error('Current working directory:', process.cwd());
        issueDetails = 'Issue details not found. Please check ISSUE_DETAILS.md file exists in project root.';
      }
    }
    
    const prompt = \`Here are the GitHub issue details:

\${issueDetails}

Based on this issue, create a detailed plan for a minimal reproduction.

Your analysis should include:
1. Core problem identification
2. Likely root causes
3. Required setup/dependencies
4. Step-by-step reproduction strategy

Be specific about what files need to be created and what code should demonstrate the issue.\`;
    
    const response = await agent.generate(prompt, {
      maxTokens: 2000,
    });
    
    return {
      analysis: response.text || 'Unable to analyze issue',
      reproductionPlan: response.text || 'Unable to create reproduction plan',
    };
  },
});

const createReproductionWithAgent = createStep({
  id: 'create-reproduction-with-agent',
  description: 'Uses the debug agent to create reproduction files',
  inputSchema: z.object({
    reproductionPlan: z.string(),
  }),
  outputSchema: z.object({
    filesCreated: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ inputData }) => {
    const agent = await mastra.getAgent('debugAgent');
    
    // Extract issue number from project name
    // When running in mastra dev, cwd is .mastra/output, so we need to look at project root
    let projectName = path.basename(process.cwd());
    if (projectName === 'output' && process.cwd().includes('.mastra')) {
      // We're in .mastra/output, get the actual project name
      projectName = path.basename(path.join(process.cwd(), '../..'));
    }
    const issueNumber = projectName.match(/debug-issue-(\\d+)/)?.[1] || 'unknown';
    
    // Read issue details for additional context
    // When running in mastra dev, cwd is .mastra/output, so we need to go up to project root
    let issueDetails = '';
    try {
      // Try project root first (when running in mastra dev)
      const projectRoot = path.join(process.cwd(), '../..');
      const issueDetailsPath = path.join(projectRoot, 'ISSUE_DETAILS.md');
      issueDetails = await fs.readFile(issueDetailsPath, 'utf-8');
    } catch (error) {
      try {
        // Fallback to current directory (for testing or different runtime)
        const issueDetailsPath = path.join(process.cwd(), 'ISSUE_DETAILS.md');
        issueDetails = await fs.readFile(issueDetailsPath, 'utf-8');
      } catch (fallbackError) {
        console.error('Could not read issue details for reproduction context');
        console.error('Attempted paths:', path.join(process.cwd(), '../..', 'ISSUE_DETAILS.md'), 'and', path.join(process.cwd(), 'ISSUE_DETAILS.md'));
      }
    }
    
    const prompt = \`Based on this reproduction plan, create the actual reproduction files:

\${inputData.reproductionPlan}

Original Issue Details:
\${issueDetails}

Requirements:
1. Create files in the src/reproductions/ directory
2. Include a main reproduction file that demonstrates the issue
3. Add clear comments explaining what the reproduction shows
4. Include any necessary setup or configuration files
5. Add a README.md in src/reproductions/ explaining how to run the reproduction

Remember this is for issue #\${issueNumber}. Use the filesystem MCP tools to create the files.\`;
    
    const response = await agent.generate(prompt, {
      maxTokens: 4000,
    });
    
    // The agent should have created files, we just return the summary
    return {
      filesCreated: [], // Agent will mention created files in the response
      message: response.text || 'Reproduction files created',
    };
  },
});

const testReproduction = createStep({
  id: 'test-reproduction',
  description: 'Uses the agent to test the reproduction',
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    testResult: z.string(),
    reproduced: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const agent = await mastra.getAgent('debugAgent');
    
    const response = await agent.generate(
      'Test the reproduction files you created. Check if they successfully demonstrate the issue. Report back on whether the issue was reproduced.',
      { maxTokens: 1000 }
    );
    
    // Simple heuristic to determine if reproduction was successful
    const reproduced = response.text?.toLowerCase().includes('reproduced') || 
                      response.text?.toLowerCase().includes('confirmed') ||
                      response.text?.toLowerCase().includes('demonstrated');
    
    return {
      testResult: response.text || 'Unable to test reproduction',
      reproduced: !!reproduced,
    };
  },
});

export const reproduceIssueWorkflow = createWorkflow({
  id: 'reproduce-issue-workflow',
  description: 'Analyzes the GitHub issue and creates a minimal reproduction using the debug agent',
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    analysis: z.string(),
  }),
})
  .then(analyzeIssueWithAgent)
  .then(createReproductionWithAgent)
  .then(testReproduction)
  .then(createStep({
    id: 'summarize-results',
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      analysis: z.string(),
    }),
    execute: async ({ prevData }) => {
      return {
        success: prevData.reproduced,
        message: \`\${prevData.message}\\n\\nTest Result: \${prevData.testResult}\`,
        analysis: prevData.analysis,
      };
    },
  }));

reproduceIssueWorkflow.commit();
`;
      await fs.writeFile(path.join(config.path, 'src/mastra/workflows/index.ts'), content);
    } else {
      // Original workflow for non-debug projects
      const content = `import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const analyzeIssue = createStep({
  id: 'analyze-issue',
  description: 'Analyzes a GitHub issue',
  inputSchema: z.object({
    issueNumber: z.number(),
    issueBody: z.string(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    relatedFiles: z.array(z.string()),
    suggestedApproach: z.string(),
  }),
  execute: async ({ inputData }) => {
    // TODO: Implement issue analysis
    return {
      summary: \`Issue #\${inputData.issueNumber} needs investigation\`,
      relatedFiles: [],
      suggestedApproach: 'Start by examining the error logs',
    };
  },
});

const investigateCode = createStep({
  id: 'investigate-code',
  description: 'Investigates related code files',
  inputSchema: z.object({
    relatedFiles: z.array(z.string()),
  }),
  outputSchema: z.object({
    findings: z.string(),
    potentialFixes: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    // TODO: Implement code investigation
    return {
      findings: 'Code investigation complete',
      potentialFixes: ['Consider updating the configuration'],
    };
  },
});

export const debugWorkflow = createWorkflow({
  id: 'debug-issue-workflow',
  inputSchema: z.object({
    issueNumber: z.number(),
    issueBody: z.string(),
  }),
  outputSchema: z.object({
    report: z.string(),
  }),
})
  .then(analyzeIssue)
  .then(investigateCode)
  .then(createStep({
    id: 'generate-report',
    execute: async ({ prevData }) => {
      return {
        report: \`Debug Report:\\n\\nFindings: \${prevData.findings}\\n\\nSuggested Fixes:\\n\${prevData.potentialFixes.join('\\n')}\`,
      };
    },
  }));

debugWorkflow.commit();
`;
      await fs.writeFile(path.join(config.path, 'src/mastra/workflows/index.ts'), content);
    }
  }

  private async installDependencies(config: ProjectConfig): Promise<void> {
    const spinner = ora('Installing dependencies...').start();

    try {
      // First check if pnpm is available
      try {
        await execa('pnpm', ['--version']);
      } catch {
        spinner.fail('pnpm not found. Please install pnpm globally: npm install -g pnpm');
        return;
      }

      // Log the path for debugging
      console.log(chalk.gray(`Installing in: ${config.path}`));

      if (config.mode === 'local') {
        // For local mode, we need to build and link packages
        console.log(chalk.cyan('\n🔧 Local mode: Will install npm packages then link to local builds'));
        spinner.text = 'Building local packages...';

        // Build monorepo packages first
        try {
          // Build packages
          await execa('pnpm', ['--dir', this.rootDir, 'run', 'build:packages'], { 
            cwd: this.rootDir,
            stdio: 'pipe',
            env: {
              ...process.env,
              // Clear PNPM_HOME to avoid conflicts
              PNPM_HOME: undefined
            }
          });
          
          // Also build stores (includes libsql)
          await execa('pnpm', ['--dir', this.rootDir, 'run', 'build:combined-stores'], { 
            cwd: this.rootDir,
            stdio: 'pipe',
            env: {
              ...process.env,
              PNPM_HOME: undefined
            }
          });
        } catch (buildError) {
          console.warn(chalk.yellow('Warning: Could not build local packages, continuing anyway...'));
        }

        // First install dependencies normally (latest versions)
        spinner.text = 'Installing base dependencies...';
        await execa('pnpm', ['install', '--ignore-workspace', '--no-frozen-lockfile'], {
          cwd: config.path,
          env: { ...process.env, PNPM_HOME: undefined },
        });

        // Now create symlinks to local packages
        spinner.text = 'Linking local packages...';
        const packagesToLink = [
          { name: '@mastra/core', source: 'packages/core' },
          { name: 'mastra', source: 'packages/cli' },
          { name: '@mastra/memory', source: 'packages/memory' },
          { name: '@mastra/libsql', source: 'stores/libsql' },
          { name: '@mastra/mcp', source: 'packages/mcp' },
        ];

        console.log(chalk.blue('\n📦 Linking local packages:'));
        
        for (const pkg of packagesToLink) {
          const sourcePath = path.join(this.rootDir, pkg.source);
          const targetPath = path.join(config.path, 'node_modules', pkg.name);
          
          try {
            // Check if source exists
            if (await fs.pathExists(sourcePath)) {
              // Remove the existing package
              await fs.remove(targetPath);
              
              // Create a symlink to the local package
              await fs.ensureSymlink(sourcePath, targetPath, 'dir');
              console.log(chalk.green(`   ✓ ${pkg.name} → local build`));
            } else {
              console.log(chalk.yellow(`   ⚠ ${pkg.name} - source not found`));
            }
          } catch (linkError) {
            console.warn(chalk.red(`   ✗ ${pkg.name} - ${linkError.message}`));
          }
        }
        
        console.log(chalk.gray('\n   Note: package.json shows "latest" but local builds are linked'));
        spinner.text = 'Local packages linked';
      } else {
        // Normal installation
        // For alpha/beta versions, we might need to use --no-strict-peer-dependencies
        const installArgs = ['install', '--ignore-workspace', '--no-frozen-lockfile'];
        if (config.mode === 'alpha') {
          installArgs.push('--no-strict-peer-dependencies');
        }

        await execa('pnpm', installArgs, {
          cwd: config.path,
          env: { ...process.env, PNPM_HOME: undefined },
        });
      }

      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      console.error(chalk.red('\nInstallation error:'), error.message);
      console.error(chalk.yellow('\nYou may need to run `pnpm install` manually in the project directory'));
      // Don't throw - let the caller decide what to do
    }
  }

  async createDebugProject(issueNumber: number, issueData: any): Promise<string> {
    const projectName = `debug-issue-${issueNumber}`;
    const projectPath = path.join(this.rootDir, 'maintainer-tools', 'test-projects', projectName);

    // Create the project directory first
    await fs.ensureDir(projectPath);

    // Create ISSUE_DETAILS.md BEFORE creating the project
    // This way the agent can read it during initialization
    const issueDetails = await this.formatIssueDetails(issueNumber, issueData);
    await fs.writeFile(path.join(projectPath, 'ISSUE_DETAILS.md'), issueDetails);

    const config: ProjectConfig = {
      name: projectName,
      path: projectPath,
      mode: 'latest',
      includeAgent: true,
      includeWorkflow: true,
      includeMemory: true,
      aiProvider: 'anthropic', // Default to Claude for debugging
    };

    await this.createProject(config);

    // Add debug instructions
    const debugInstructions = `# Debug Instructions for Issue #${issueNumber}

**Title:** ${issueData.title}

**URL:** ${issueData.html_url}

**Description:**
${issueData.body || 'No description provided'}

**Labels:** ${issueData.labels.map((l: any) => l.name).join(', ')}

## Your Task

1. **Analyze the issue** - Understand what's broken and why
2. **Search for relevant code** - Use the tools to find related files
3. **Investigate the implementation** - Read the code to understand the current behavior
4. **Reproduce the issue** - Try to recreate the problem locally
5. **Suggest or implement a fix** - Provide concrete solutions
6. **Verify the fix** - Ensure your solution resolves the issue

## Available Tools

The debug agent has these powerful tools:

### File System Tools
- \\\`fileSystemTool\\\`: Read any file in the codebase
- \\\`listFilesTool\\\`: List directory contents to explore the structure

### Search Tools
- \\\`searchCodeTool\\\`: Search for patterns in code files (uses glob patterns)
- \\\`grepTool\\\`: Advanced grep-like search with context and regex support

### Execution Tool
- \\\`runCommandTool\\\`: Execute terminal commands (npm, git, tests, etc.)

## Tips for Effective Debugging

1. **ALWAYS start by listing directories**
   - Use \\\`listFilesTool\\\` to explore the project structure first
   - Navigate through directories before searching for specific files
   - Example: \\\`listFilesTool({ path: "../../../packages" })\\\` then drill down
   
2. **Only search when necessary**
   - After exploring directories, use \\\`grepTool\\\` for content searches
   - Avoid searching for file names - list directories instead
   
3. **Understand the architecture**
   - Read key files like package.json, tsconfig.json
   - Check the main entry points in packages/core/src
   
4. **Trace the execution flow**
   - Follow imports to understand dependencies
   - Look for related tests to understand expected behavior
   
5. **Test your hypotheses**
   - Use \\\`runCommandTool\\\` to run tests
   - Try to reproduce the issue with minimal code

## Common Debugging Patterns

### Finding where a function is defined:
\\\`\\\`\\\`
grepTool({ pattern: "function myFunction|const myFunction|export.*myFunction" })
\\\`\\\`\\\`

### Finding all imports of a module:
\\\`\\\`\\\`
grepTool({ pattern: "import.*from.*@mastra/core" })
\\\`\\\`\\\`

### Running tests for a specific package:
\\\`\\\`\\\`
runCommandTool({ command: "pnpm test", cwd: "packages/core" })
\\\`\\\`\\\`

### Checking recent git changes:
\\\`\\\`\\\`
runCommandTool({ command: "git log --oneline -10" })
\\\`\\\`\\\`

## Project Structure Reference

- \\\`packages/core\\\`: Main framework code
- \\\`packages/cli\\\`: CLI and playground
- \\\`packages/memory\\\`: Memory persistence system
- \\\`stores/\\\`: Various storage adapters
- \\\`examples/\\\`: Example applications
- \\\`docs/\\\`: Documentation

Good luck debugging! Remember to think systematically and use the tools effectively.
`;

    await fs.writeFile(path.join(projectPath, 'DEBUG_INSTRUCTIONS.md'), debugInstructions);

    // Create a debugging tips file
    const debuggingTips = `# Debugging Tips for Mastra Framework

## Quick Start Commands

### 1. Clone and Navigate to Monorepo Root
\\\`\\\`\\\`bash
# If not already in the monorepo
cd ../../../  # Navigate to monorepo root from test project
\\\`\\\`\\\`

### 2. Finding Files and Code

#### IMPORTANT: Always list directories first!
\\\`\\\`\\\`javascript
// Before searching for a file, list the directory to see what's there
await listFilesTool({ path: "../../../packages/core/src" })

// Then navigate to subdirectories
await listFilesTool({ path: "../../../packages/core/src/agent" })

// Only search when you need to find content across many files
\\\`\\\`\\\`

#### Find class/function definitions (after exploring directories):
\\\`\\\`\\\`javascript
await grepTool({ 
  pattern: "class YourClass|function yourFunction|export.*yourFunction",
  includePattern: "**/*.ts"
})
\\\`\\\`\\\`

#### Find where something is imported:
\\\`\\\`\\\`javascript
await grepTool({ 
  pattern: "import.*YourThing.*from",
  includePattern: "**/*.ts"
})
\\\`\\\`\\\`

#### Find error messages:
\\\`\\\`\\\`javascript
await grepTool({ 
  pattern: "Error.*specific message|throw.*Error",
  includePattern: "**/*.ts"
})
\\\`\\\`\\\`

### 3. Explore Package Structure (DO THIS FIRST!)

\\\`\\\`\\\`javascript
// ALWAYS start by listing directories to understand structure
await listFilesTool({ path: "../../../packages" })

// Explore a specific package
await listFilesTool({ path: "../../../packages/core/src" })

// Find what's in a subdirectory
await listFilesTool({ path: "../../../packages/core/src/agent" })

// Only after listing, read specific files you found
await readFileTool({ path: "../../../packages/core/src/agent/agent.ts" })
\\\`\\\`\\\`

### 4. Run Tests

\\\`\\\`\\\`javascript
// Run all tests for a package
await runCommandTool({ 
  command: "pnpm test",
  cwd: "../../../packages/core"
})

// Run specific test file
await runCommandTool({ 
  command: "pnpm test agent.test.ts",
  cwd: "../../../packages/core"
})
\\\`\\\`\\\`

### 5. Check Recent Changes

\\\`\\\`\\\`javascript
// See recent commits
await runCommandTool({ 
  command: "git log --oneline -20",
  cwd: "../../../"
})

// See what changed in a file
await runCommandTool({ 
  command: "git log -p packages/core/src/agent/agent.ts",
  cwd: "../../../"
})
\\\`\\\`\\\`

## Understanding Mastra Architecture

### Core Concepts
- **Agents**: AI-powered assistants with tools and memory
- **Tools**: Functions that agents can call
- **Workflows**: Multi-step processes with suspend/resume
- **Memory**: Conversation persistence and recall

### Key Files to Check
1. \\\`packages/core/src/mastra/index.ts\\\` - Main entry point
2. \\\`packages/core/src/agent/agent.ts\\\` - Agent implementation
3. \\\`packages/core/src/tools/createTool.ts\\\` - Tool system
4. \\\`packages/core/src/workflows/\\\` - Workflow engine

### Available Resources
- **Mastra Docs**: The agent has access to the official Mastra documentation via MCP
- **Reproduction Workflow**: Use the \\\`reproduceIssueWorkflow\\\` to create test cases
- **Debug Project**: Create reproduction code in \\\`src/reproductions/\\\`

### Common Issues and Solutions

#### "Module not found" errors
- Check package.json dependencies
- Verify imports use correct paths
- Ensure packages are built: \\\`pnpm build\\\`

#### Type errors
- Check TypeScript version compatibility
- Look for recent changes to interfaces
- Run \\\`pnpm typecheck\\\` in the package

#### Runtime errors
- Check for missing environment variables
- Verify database connections
- Look for initialization order issues

## Debugging Workflow

1. **Reproduce the issue**
   - Create minimal test case in \\\`src/reproductions/\\\`
   - Use the playground to run the reproduceIssueWorkflow
   - The workflow will ask the debug agent to create reproduction files
   - Example workflow usage in playground:
     \\\`\\\`\\\`javascript
     // Run the workflow from the playground UI - no inputs needed!
     // Click "Execute" on reproduceIssueWorkflow
     // The workflow will automatically:
     // 1. Ask agent to analyze the issue
     // 2. Ask agent to create reproduction files
     // 3. Ask agent to test the reproduction
     \\\`\\\`\\\`
   - Or manually ask the agent to create files:
     \\\`\\\`\\\`
     "Create a minimal reproduction for this issue in src/reproductions/"
     \\\`\\\`\\\`

2. **Use Mastra Documentation**
   - Check the docs for correct API usage
   - Look for similar examples in the documentation
   - Verify you're using the latest patterns

3. **Trace the code path**
   - Find where error originates
   - Follow function calls backwards
   - Check recent commits to those files

4. **Test your fix**
   - Make changes in the monorepo
   - Run relevant tests
   - Test in example projects

5. **Verify no regressions**
   - Run full test suite
   - Check related functionality
   - Test edge cases

Remember: The agent has full access to the monorepo at ../../../ relative to this project!
`;

    await fs.writeFile(path.join(projectPath, 'DEBUGGING_TIPS.md'), debuggingTips);

    return projectPath;
  }

  private async formatIssueDetails(issueNumber: number, issueData: any): Promise<string> {
    let content = `# Issue #${issueNumber}: ${issueData.title}\n\n`;
    content += `**Status:** ${issueData.state}\n`;
    content += `**Created by:** @${issueData.user.login}\n`;
    content += `**Labels:** ${issueData.labels.map((l: any) => l.name).join(', ')}\n`;
    content += `**URL:** ${issueData.html_url}\n\n`;
    
    content += `## Description\n\n${issueData.body || 'No description provided'}\n\n`;
    
    // Add comments if any
    if (issueData.comments_data && issueData.comments_data.length > 0) {
      content += `## Comments (${issueData.comments_data.length})\n\n`;
      for (const comment of issueData.comments_data) {
        content += `### @${comment.user.login} - ${new Date(comment.created_at).toLocaleString()}\n\n`;
        content += `${comment.body}\n\n`;
      }
    }
    
    return content;
  }

  async createSmokeTestProject(
    mode: ProjectConfig['mode'],
    version?: string,
    features?: string[],
    aiProvider?: ProjectConfig['aiProvider'],
  ): Promise<string> {
    // Create a more readable timestamp format
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-MM-SS
    const projectName = `smoke-test-${mode}-${timestamp}`;
    const projectPath = path.join(this.rootDir, 'maintainer-tools', 'test-projects', projectName);

    const config: ProjectConfig = {
      name: projectName,
      path: projectPath,
      mode,
      version,
      includeAgent: features?.includes('agent') ?? true,
      includeWorkflow: features?.includes('workflow') ?? true,
      includeMemory: features?.includes('memory') ?? true,
      aiProvider: aiProvider || 'anthropic',
    };

    await this.createProject(config);

    // Add a simple index.html for playground UI
    await this.createPlaygroundFiles(projectPath);

    return projectPath;
  }

  private async createPlaygroundFiles(projectPath: string): Promise<void> {
    // Create a simple HTML file to test the playground
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mastra Test Playground</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #f5f5f5;
    }
    h1 {
      color: #333;
    }
    .info {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 1rem;
    }
    .status {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      margin: 0.5rem 0;
    }
    .success {
      background: #d4edda;
      color: #155724;
    }
    .warning {
      background: #fff3cd;
      color: #856404;
    }
    code {
      background: #f0f0f0;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <h1>🧪 Mastra Test Playground</h1>
  
  <div class="info">
    <h2>Project Info</h2>
    <p><strong>Mode:</strong> <code>${projectPath.match(/smoke-test-(\\w+)-/)?.[1] || 'unknown'}</code></p>
    <p><strong>Location:</strong> <code>${projectPath}</code></p>
  </div>

  <div class="info">
    <h2>Quick Start</h2>
    <ol>
      <li>Make sure you've set your API keys in <code>.env</code></li>
      <li>Run <code>pnpm dev</code> if you haven't already</li>
      <li>The Mastra playground should be available at <a href="http://localhost:3000">http://localhost:3000</a></li>
    </ol>
  </div>

  <div class="info">
    <h2>Test Checklist</h2>
    <ul>
      <li>✅ Project scaffolding complete</li>
      <li>⏳ API keys configured</li>
      <li>⏳ Dev server started</li>
      <li>⏳ Agent interaction tested</li>
      <li>⏳ Tool execution tested</li>
      <li>⏳ Memory persistence tested</li>
      <li>⏳ Workflow execution tested</li>
    </ul>
  </div>

  <div class="status success">
    ✨ Your test environment is ready! Start testing by running the dev server.
  </div>
</body>
</html>`;

    await fs.writeFile(path.join(projectPath, 'index.html'), indexHtml);
  }
}

