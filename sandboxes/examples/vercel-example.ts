import { VercelSandbox } from '@mastra/sandbox-vercel';

async function main() {
  // Initialize Vercel sandbox
  const sandbox = new VercelSandbox({
    name: 'my-vercel-sandbox',
    credentials: {
      token: process.env.VERCEL_TOKEN!,
      teamId: process.env.VERCEL_TEAM_ID, // optional
    },
  });

  try {
    // Create a new sandbox environment
    console.log('Creating sandbox...');
    const sandboxInfo = await sandbox.create({
      name: 'test-execution-env',
      env: {
        NODE_ENV: 'production',
        DEBUG: 'true',
      },
      timeout: 10000, // 10 seconds
      memoryLimit: 1024, // 1GB
      runtime: 'node22', // Specify Node.js 22 runtime
    });

    console.log('Sandbox created:', sandboxInfo);

    // Execute a simple Node.js script
    console.log('Executing code...');
    const result = await sandbox.execute(sandboxInfo.id, {
      command: 'node',
      args: ['-e', 'console.log("Hello from Vercel sandbox!"); console.log(process.env.NODE_ENV);'],
      environment: {
        timeout: 5000,
      },
    });

    console.log('Execution result:', result);

    // Stream execution for long-running processes
    console.log('Streaming execution...');
    const streamResult = await sandbox.executeStream(sandboxInfo.id, {
      command: 'node',
      args: ['-e', `
        for (let i = 0; i < 5; i++) {
          console.log(\`Step \${i + 1}/5\`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('Done!');
      `],
      environment: {
        timeout: 10000,
      },
    });

    // Process the stream
    if (streamResult.stdout) {
      const reader = streamResult.stdout.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          console.log('Stream output:', new TextDecoder().decode(value));
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Upload a file to the sandbox
    console.log('Uploading file...');
    await sandbox.uploadFiles(sandboxInfo.id, [{
      localPath: './package.json',
      sandboxPath: '/tmp/package.json',
    }]);

    // Note: Vercel Sandbox API doesn't have a listFiles method
    // Files are managed through the sandbox's file system directly

    // Get resource usage
    console.log('Getting resource usage...');
    const usage = await sandbox.getResourceUsage(sandboxInfo.id);
    console.log('Resource usage:', usage);

    // Clean up
    console.log('Destroying sandbox...');
    await sandbox.destroy(sandboxInfo.id);

  } catch (error) {
    console.error('Error:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}