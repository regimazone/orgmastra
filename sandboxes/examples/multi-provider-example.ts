import { VercelSandbox } from '@mastra/sandbox-vercel';
import { DaytonaSandbox } from '@mastra/sandbox-daytona';
import type { MastraSandbox } from '@mastra/core';

/**
 * Example demonstrating how to use multiple sandbox providers
 * depending on the use case and requirements
 */

interface SandboxProvider {
  name: string;
  sandbox: MastraSandbox;
  useCases: string[];
}

async function demonstrateMultiProvider() {
  // Initialize different sandbox providers
  const providers: SandboxProvider[] = [
    {
      name: 'Vercel',
      sandbox: new VercelSandbox({
        name: 'vercel-executor',
        apiToken: process.env.VERCEL_TOKEN!,
        runtime: 'nodejs',
        maxDuration: 30,
      }),
      useCases: ['serverless functions', 'edge computing', 'quick scripts'],
    },
    {
      name: 'Daytona',
      sandbox: new DaytonaSandbox({
        name: 'daytona-workspace',
        apiKey: process.env.DAYTONA_API_KEY!,
        serverUrl: process.env.DAYTONA_SERVER_URL!,
        defaultTemplate: 'nodejs',
      }),
      useCases: ['development environments', 'complex builds', 'long-running processes'],
    },
  ];

  console.log('Available sandbox providers:');
  providers.forEach(provider => {
    console.log(`- ${provider.name}: ${provider.useCases.join(', ')}`);
  });

  // Scenario 1: Quick script execution (best for Vercel)
  console.log('\n--- Scenario 1: Quick Script Execution ---');
  const vercelProvider = providers.find(p => p.name === 'Vercel')!;
  
  try {
    const quickSandbox = await vercelProvider.sandbox.create({
      name: 'quick-script-env',
      environment: {
        timeout: 10000,
        memoryLimit: 512,
      },
    });

    const scriptResult = await vercelProvider.sandbox.execute(quickSandbox.id, {
      command: 'node',
      args: ['-e', `
        const data = [1, 2, 3, 4, 5];
        const sum = data.reduce((a, b) => a + b, 0);
        console.log('Sum:', sum);
        console.log('Average:', sum / data.length);
      `],
      environment: { timeout: 5000 },
    });

    console.log('Quick script result:', scriptResult.output);
    await vercelProvider.sandbox.destroy(quickSandbox.id);
  } catch (error) {
    console.error('Quick script error:', error);
  }

  // Scenario 2: Full development workflow (best for Daytona)
  console.log('\n--- Scenario 2: Development Workflow ---');
  const daytonaProvider = providers.find(p => p.name === 'Daytona')!;
  
  try {
    const devSandbox = await daytonaProvider.sandbox.create({
      name: 'dev-workflow-env',
      environment: {
        timeout: 600000, // 10 minutes
        memoryLimit: 4096, // 4GB
        env: {
          NODE_ENV: 'development',
        },
      },
    });

    // Setup a simple Node.js project
    await daytonaProvider.sandbox.execute(devSandbox.id, {
      command: 'mkdir',
      args: ['-p', '/workspace/myapp'],
      environment: { timeout: 5000 },
    });

    // Create package.json
    await daytonaProvider.sandbox.execute(devSandbox.id, {
      command: 'bash',
      args: ['-c', `cat > /workspace/myapp/package.json << 'EOF'
{
  "name": "myapp",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js",
    "test": "echo \\"Tests passed!\\""
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
EOF`],
      environment: { timeout: 5000 },
    });

    // Create a simple Express app
    await daytonaProvider.sandbox.execute(devSandbox.id, {
      command: 'bash',
      args: ['-c', `cat > /workspace/myapp/index.js << 'EOF'
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Daytona sandbox!' });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
EOF`],
      environment: { timeout: 5000 },
    });

    // Install dependencies
    console.log('Installing dependencies...');
    const installResult = await daytonaProvider.sandbox.execute(devSandbox.id, {
      command: 'npm',
      args: ['install'],
      environment: {
        cwd: '/workspace/myapp',
        timeout: 120000,
      },
    });

    console.log('Dependencies installed:', installResult.exitCode === 0 ? 'SUCCESS' : 'FAILED');

    // Run tests
    const testResult = await daytonaProvider.sandbox.execute(devSandbox.id, {
      command: 'npm',
      args: ['test'],
      environment: {
        cwd: '/workspace/myapp',
        timeout: 30000,
      },
    });

    console.log('Tests result:', testResult.output);

    // Clean up
    await daytonaProvider.sandbox.destroy(devSandbox.id);
  } catch (error) {
    console.error('Development workflow error:', error);
  }

  // Scenario 3: Parallel execution across providers
  console.log('\n--- Scenario 3: Parallel Execution ---');
  
  const tasks = [
    {
      provider: vercelProvider,
      name: 'data-processing',
      task: async (sandbox: MastraSandbox, sandboxId: string) => {
        return await sandbox.execute(sandboxId, {
          command: 'node',
          args: ['-e', `
            const data = Array.from({length: 1000}, (_, i) => i);
            const processed = data.map(x => x * 2).filter(x => x % 4 === 0);
            console.log('Processed', processed.length, 'items');
          `],
          environment: { timeout: 10000 },
        });
      },
    },
    {
      provider: daytonaProvider,
      name: 'environment-check',
      task: async (sandbox: MastraSandbox, sandboxId: string) => {
        return await sandbox.execute(sandboxId, {
          command: 'bash',
          args: ['-c', 'uname -a && node --version && npm --version'],
          environment: { timeout: 10000 },
        });
      },
    },
  ];

  try {
    const sandboxes = await Promise.all(
      tasks.map(async task => {
        const sandbox = await task.provider.sandbox.create({
          name: `parallel-${task.name}`,
          environment: { timeout: 30000 },
        });
        return { ...task, sandboxId: sandbox.id };
      })
    );

    const results = await Promise.all(
      sandboxes.map(async ({ provider, task, name, sandboxId }) => {
        try {
          const result = await task(provider.sandbox, sandboxId);
          return { name, success: true, result };
        } catch (error) {
          return { name, success: false, error };
        }
      })
    );

    console.log('Parallel execution results:');
    results.forEach(result => {
      console.log(`- ${result.name}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      if (result.success) {
        console.log(`  Output: ${result.result.output?.substring(0, 100)}...`);
      }
    });

    // Clean up all sandboxes
    await Promise.all(
      sandboxes.map(({ provider, sandboxId }) =>
        provider.sandbox.destroy(sandboxId).catch(console.error)
      )
    );
  } catch (error) {
    console.error('Parallel execution setup error:', error);
  }

  console.log('\nMulti-provider demonstration complete!');
}

// Provider selection helper
function selectBestProvider(
  providers: SandboxProvider[],
  requirements: {
    maxDuration?: number;
    memoryNeeded?: number;
    needsPersistence?: boolean;
    needsGit?: boolean;
  }
): SandboxProvider {
  // Simple logic to select the best provider based on requirements
  if (requirements.maxDuration && requirements.maxDuration < 60000) {
    // Short tasks - prefer Vercel
    return providers.find(p => p.name === 'Vercel') || providers[0];
  }
  
  if (requirements.needsPersistence || requirements.needsGit) {
    // Complex tasks - prefer Daytona
    return providers.find(p => p.name === 'Daytona') || providers[0];
  }
  
  // Default to first available
  return providers[0];
}

if (require.main === module) {
  demonstrateMultiProvider().catch(console.error);
}