import { DaytonaSandbox } from '@mastra/sandbox-daytona';

async function main() {
  // Initialize Daytona sandbox
  const sandbox = new DaytonaSandbox({
    name: 'my-daytona-sandbox',
    apiKey: process.env.DAYTONA_API_KEY!,
    serverUrl: process.env.DAYTONA_SERVER_URL || 'https://api.daytona.io',
    defaultTemplate: 'nodejs',
    gitProvider: {
      provider: 'github',
      username: process.env.GITHUB_USERNAME,
      token: process.env.GITHUB_TOKEN,
    },
  });

  try {
    // Create a new development workspace
    console.log('Creating workspace...');
    const sandboxInfo = await sandbox.create({
      name: 'test-workspace',
      environment: {
        env: {
          NODE_ENV: 'development',
          PORT: '3000',
        },
        timeout: 300000, // 5 minutes
        memoryLimit: 4096, // 4GB
      },
    });

    console.log('Workspace created:', sandboxInfo);

    // Clone a repository into the workspace
    console.log('Setting up project...');
    await sandbox.execute(sandboxInfo.id, {
      command: 'git',
      args: ['clone', 'https://github.com/example/sample-project.git', '/workspace/project'],
      environment: {
        cwd: '/workspace',
        timeout: 30000,
      },
    });

    // Install dependencies
    console.log('Installing dependencies...');
    const installResult = await sandbox.execute(sandboxInfo.id, {
      command: 'npm',
      args: ['install'],
      environment: {
        cwd: '/workspace/project',
        timeout: 120000, // 2 minutes
      },
    });

    console.log('Install result:', installResult);

    // Run tests with streaming output
    console.log('Running tests...');
    const testStream = await sandbox.executeStream(sandboxInfo.id, {
      command: 'npm',
      args: ['test'],
      environment: {
        cwd: '/workspace/project',
        timeout: 60000,
      },
    });

    // Process the test output stream
    if (testStream.stdout) {
      const reader = testStream.stdout.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          console.log('Test output:', new TextDecoder().decode(value));
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Upload a custom configuration file
    console.log('Uploading config...');
    await sandbox.uploadFile(sandboxInfo.id, {
      localPath: './custom-config.json',
      sandboxPath: '/workspace/project/config.json',
    });

    // Download the built artifacts
    console.log('Building project...');
    await sandbox.execute(sandboxInfo.id, {
      command: 'npm',
      args: ['run', 'build'],
      environment: {
        cwd: '/workspace/project',
        timeout: 180000, // 3 minutes
      },
    });

    // Download the dist folder
    await sandbox.downloadFile(sandboxInfo.id, {
      sandboxPath: '/workspace/project/dist',
      localPath: './downloaded-dist',
    });

    // Get workspace information
    console.log('Getting workspace info...');
    const info = await sandbox.getInfo(sandboxInfo.id);
    console.log('Workspace info:', info);

    // List all files in the project
    console.log('Listing project files...');
    const files = await sandbox.listFiles(sandboxInfo.id, '/workspace/project');
    console.log('Project files:', files);

    // Check resource usage
    console.log('Checking resource usage...');
    const usage = await sandbox.getResourceUsage(sandboxInfo.id);
    console.log('Resource usage:', usage);

    // Start a development server in the background
    console.log('Starting dev server...');
    const serverStream = await sandbox.executeStream(sandboxInfo.id, {
      command: 'npm',
      args: ['run', 'dev'],
      environment: {
        cwd: '/workspace/project',
        env: {
          PORT: '3000',
        },
      },
    });

    // Let it run for a bit
    setTimeout(async () => {
      console.log('Stopping dev server...');
      await sandbox.kill(sandboxInfo.id, serverStream.processId!);
    }, 10000);

    // Wait a bit more then clean up
    setTimeout(async () => {
      console.log('Destroying workspace...');
      await sandbox.destroy(sandboxInfo.id);
    }, 15000);

  } catch (error) {
    console.error('Error:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}