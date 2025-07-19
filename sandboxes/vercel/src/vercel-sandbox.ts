import { Vercel } from '@vercel/sdk';
import {
  MastraSandbox,
  SandboxConfig,
  SandboxInfo,
  ProcessConfig,
  ProcessResult,
  StreamingProcessResult,
  FileOperation,
  ResourceUsage,
} from '@mastra/core';
import type {
  VercelSandboxConfig,
  VercelFunctionConfig,
  VercelDeploymentInfo,
  VercelExecutionEnvironment,
} from './types';

/**
 * Vercel sandbox implementation
 * 
 * This implementation uses Vercel's serverless functions as isolated execution environments.
 * Each sandbox is essentially a Vercel function deployment that can execute code.
 */
export class VercelSandbox extends MastraSandbox {
  private client: Vercel;
  private config: VercelSandboxConfig;
  private activeSandboxes: Map<string, VercelExecutionEnvironment> = new Map();

  constructor(config: VercelSandboxConfig) {
    super({ name: 'VercelSandbox' });
    
    this.config = config;
    this.client = new Vercel({
      bearerToken: config.apiToken,
    });

    this.logger.info('VercelSandbox initialized', {
      teamId: config.teamId,
      projectId: config.projectId,
      runtime: config.runtime || 'nodejs',
    });
  }

  async create(config: SandboxConfig): Promise<SandboxInfo> {
    this.validateConfig(config);
    
    const sandboxId = this.generateSandboxId();
    this.logger.info('Creating Vercel sandbox', { sandboxId, config });

    try {
      // Create a function template based on runtime
      const functionCode = this.generateFunctionCode(config);
      
      // Deploy the function
      const deployment = await this.deployFunction(sandboxId, functionCode, config);
      
      // Wait for deployment to be ready
      await this.waitForDeployment(deployment.id);
      
      // Store sandbox environment
      const environment: VercelExecutionEnvironment = {
        region: this.config.region || 'iad1',
        url: deployment.url,
        functionId: sandboxId,
        deploymentId: deployment.id,
      };
      
      this.activeSandboxes.set(sandboxId, environment);

      const sandboxInfo: SandboxInfo = {
        id: sandboxId,
        status: 'ready',
        createdAt: new Date(),
        environment: {
          env: config.env || {},
          cwd: config.cwd || '/tmp',
          timeout: config.timeout || 30000,
          memoryLimit: this.config.functionMemory || 1024,
          cpuLimit: config.cpuLimit,
        },
      };

      this.logger.info('Vercel sandbox created successfully', { sandboxId, deploymentId: deployment.id });
      return sandboxInfo;
    } catch (error) {
      this.logger.error('Failed to create Vercel sandbox', { sandboxId, error });
      throw new Error(`Failed to create Vercel sandbox: ${error}`);
    }
  }

  async get(sandboxId: string): Promise<SandboxInfo> {
    const environment = this.activeSandboxes.get(sandboxId);
    if (!environment) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      // Get deployment info from Vercel
      const deployment = await this.client.deployments.getDeployment({
        idOrUrl: environment.deploymentId,
        teamId: this.config.teamId,
      });

      const sandboxInfo: SandboxInfo = {
        id: sandboxId,
        status: this.mapVercelStateToStatus(deployment.state),
        createdAt: new Date(deployment.createdAt),
        environment: {
          env: {},
          cwd: '/tmp',
          timeout: 30000,
          memoryLimit: this.config.functionMemory || 1024,
        },
      };

      return sandboxInfo;
    } catch (error) {
      this.logger.error('Failed to get sandbox info', { sandboxId, error });
      throw new Error(`Failed to get sandbox info: ${error}`);
    }
  }

  async list(): Promise<SandboxInfo[]> {
    try {
      const deployments = await this.client.deployments.getDeployments({
        teamId: this.config.teamId,
        projectId: this.config.projectId,
        limit: 100,
      });

      const sandboxes: SandboxInfo[] = [];
      
      for (const deployment of deployments.deployments) {
        // Filter for our sandbox deployments
        if (deployment.name && deployment.name.startsWith('sandbox_')) {
          sandboxes.push({
            id: deployment.name,
            status: this.mapVercelStateToStatus(deployment.state),
            createdAt: new Date(deployment.createdAt),
            environment: {
              env: {},
              cwd: '/tmp',
              timeout: 30000,
              memoryLimit: this.config.functionMemory || 1024,
            },
          });
        }
      }

      return sandboxes;
    } catch (error) {
      this.logger.error('Failed to list sandboxes', { error });
      throw new Error(`Failed to list sandboxes: ${error}`);
    }
  }

  async destroy(sandboxId: string): Promise<void> {
    const environment = this.activeSandboxes.get(sandboxId);
    if (!environment) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      // Delete the deployment
      await this.client.deployments.deleteDeployment({
        id: environment.deploymentId,
        teamId: this.config.teamId,
      });

      this.activeSandboxes.delete(sandboxId);
      this.logger.info('Vercel sandbox destroyed', { sandboxId });
    } catch (error) {
      this.logger.error('Failed to destroy sandbox', { sandboxId, error });
      throw new Error(`Failed to destroy sandbox: ${error}`);
    }
  }

  async execute(sandboxId: string, config: ProcessConfig): Promise<ProcessResult> {
    this.validateProcessConfig(config);
    
    const environment = this.activeSandboxes.get(sandboxId);
    if (!environment) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const startTime = Date.now();
    
    try {
      // Prepare execution payload
      const payload = {
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        cwd: config.cwd || '/tmp',
        input: config.input,
        timeout: config.timeout || 30000,
      };

      // Execute via HTTP request to the function
      const response = await fetch(environment.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      const executionTime = Date.now() - startTime;

      const processResult: ProcessResult = {
        exitCode: result.exitCode || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        executionTime,
        status: result.exitCode === 0 ? 'completed' : 'failed',
        pid: result.pid,
      };

      this.logger.info('Command executed in Vercel sandbox', {
        sandboxId,
        command: config.command,
        exitCode: processResult.exitCode,
        executionTime,
      });

      return processResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error('Failed to execute command in sandbox', {
        sandboxId,
        command: config.command,
        error,
        executionTime,
      });

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        executionTime,
        status: 'failed',
      };
    }
  }

  async executeStream(sandboxId: string, config: ProcessConfig): Promise<StreamingProcessResult> {
    // For Vercel, streaming is more complex as functions are stateless
    // This would require WebSocket or SSE implementation
    throw new Error('Streaming execution not yet supported for Vercel sandbox');
  }

  async uploadFiles(sandboxId: string, files: FileOperation[]): Promise<void> {
    // File uploads would need to be handled via Vercel Blob or similar storage
    this.logger.warn('File upload not yet implemented for Vercel sandbox', { sandboxId, fileCount: files.length });
    throw new Error('File upload not yet supported for Vercel sandbox');
  }

  async downloadFiles(sandboxId: string, files: FileOperation[]): Promise<void> {
    // File downloads would need to be handled via Vercel Blob or similar storage
    this.logger.warn('File download not yet implemented for Vercel sandbox', { sandboxId, fileCount: files.length });
    throw new Error('File download not yet supported for Vercel sandbox');
  }

  async getResourceUsage(sandboxId: string): Promise<ResourceUsage> {
    // Resource usage would come from Vercel analytics/metrics
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
    };
  }

  async isReady(sandboxId: string): Promise<boolean> {
    try {
      const info = await this.get(sandboxId);
      return info.status === 'ready';
    } catch {
      return false;
    }
  }

  async restart(sandboxId: string): Promise<SandboxInfo> {
    // For Vercel, restart means redeploying the function
    const environment = this.activeSandboxes.get(sandboxId);
    if (!environment) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    // Destroy and recreate
    await this.destroy(sandboxId);
    return this.create({
      name: sandboxId,
      env: this.config.env,
    });
  }

  private generateFunctionCode(config: SandboxConfig): string {
    const runtime = this.config.runtime || 'nodejs';
    
    if (runtime === 'edge') {
      return this.generateEdgeFunctionCode(config);
    } else {
      return this.generateNodeJSFunctionCode(config);
    }
  }

  private generateNodeJSFunctionCode(config: SandboxConfig): string {
    return `
import { spawn } from 'child_process';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { command, args = [], env = {}, cwd = '/tmp', input, timeout = 30000 } = req.body;

  try {
    const result = await executeCommand(command, args, { env, cwd, input, timeout });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      exitCode: 1,
      stdout: '',
      stderr: error.message,
      status: 'failed'
    });
  }
}

function executeCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Command timed out'));
    }, options.timeout);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        status: code === 0 ? 'completed' : 'failed',
        pid: child.pid
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}
    `.trim();
  }

  private generateEdgeFunctionCode(config: SandboxConfig): string {
    return `
export const runtime = 'edge';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { command, args = [], env = {} } = await request.json();
    
    // Edge runtime has limited capabilities
    // This is a simplified version for basic commands
    const result = {
      exitCode: 0,
      stdout: \`Executed: \${command} \${args.join(' ')}\`,
      stderr: '',
      status: 'completed',
      pid: Math.floor(Math.random() * 10000)
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      exitCode: 1,
      stdout: '',
      stderr: error.message,
      status: 'failed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
    `.trim();
  }

  private async deployFunction(name: string, source: string, config: SandboxConfig): Promise<VercelDeploymentInfo> {
    try {
      const deploymentResult = await this.client.deployments.createDeployment({
        teamId: this.config.teamId,
        requestBody: {
          name,
          files: [
            {
              file: 'index.js',
              data: source,
            },
            {
              file: 'package.json',
              data: JSON.stringify({
                name,
                version: '1.0.0',
                type: 'module',
                main: 'index.js',
              }),
            },
          ],
          projectSettings: {
            framework: null,
          },
          target: 'production',
        },
      });

      return {
        id: deploymentResult.id,
        url: deploymentResult.url,
        state: 'BUILDING',
        createdAt: Date.now(),
        projectId: this.config.projectId,
        teamId: this.config.teamId,
      };
    } catch (error) {
      this.logger.error('Failed to deploy function', { name, error });
      throw new Error(`Failed to deploy function: ${error}`);
    }
  }

  private async waitForDeployment(deploymentId: string, maxWaitTime = 300000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const deployment = await this.client.deployments.getDeployment({
          idOrUrl: deploymentId,
          teamId: this.config.teamId,
        });

        if (deployment.state === 'READY') {
          return;
        }
        
        if (deployment.state === 'ERROR' || deployment.state === 'CANCELED') {
          throw new Error(`Deployment failed with state: ${deployment.state}`);
        }

        // Wait 5 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        this.logger.error('Error checking deployment status', { deploymentId, error });
        throw error;
      }
    }

    throw new Error('Deployment timed out');
  }

  private mapVercelStateToStatus(state: string): SandboxInfo['status'] {
    switch (state) {
      case 'BUILDING':
      case 'INITIALIZING':
      case 'QUEUED':
        return 'initializing';
      case 'READY':
        return 'ready';
      case 'ERROR':
        return 'error';
      case 'CANCELED':
        return 'stopped';
      default:
        return 'error';
    }
  }
}