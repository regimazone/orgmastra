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
  DaytonaSandboxConfig,
  DaytonaWorkspaceConfig,
  DaytonaWorkspaceInfo,
} from './types';

/**
 * Daytona sandbox implementation
 * 
 * This implementation uses Daytona workspaces as development environments.
 * Each sandbox is a Daytona workspace that provides a full development environment.
 */
export class DaytonaSandbox extends MastraSandbox {
  private config: DaytonaSandboxConfig;
  private activeWorkspaces: Map<string, DaytonaWorkspaceInfo> = new Map();

  constructor(config: DaytonaSandboxConfig) {
    super({ name: 'DaytonaSandbox' });
    
    this.config = config;
    
    this.logger.info('DaytonaSandbox initialized', {
      serverUrl: config.serverUrl,
      defaultTemplate: config.defaultTemplate,
    });
  }

  async create(config: SandboxConfig): Promise<SandboxInfo> {
    this.validateConfig(config);
    
    const sandboxId = this.generateSandboxId();
    this.logger.info('Creating Daytona workspace', { sandboxId, config });

    try {
      const workspaceConfig: DaytonaWorkspaceConfig = {
        name: config.name || sandboxId,
        template: this.config.defaultTemplate,
        env: config.env,
      };

      const workspace = await this.createWorkspace(workspaceConfig);
      this.activeWorkspaces.set(sandboxId, workspace);

      // Wait for workspace to be ready
      await this.waitForWorkspace(workspace.id);

      const sandboxInfo: SandboxInfo = {
        id: sandboxId,
        status: 'ready',
        createdAt: new Date(),
        environment: {
          env: config.env || {},
          cwd: '/workspace',
          timeout: config.timeout || 300000, // 5 minutes default for dev environments
          memoryLimit: config.memoryLimit || 2048,
          cpuLimit: config.cpuLimit,
        },
      };

      this.logger.info('Daytona workspace created successfully', { sandboxId, workspaceId: workspace.id });
      return sandboxInfo;
    } catch (error) {
      this.logger.error('Failed to create Daytona workspace', { sandboxId, error });
      throw new Error(`Failed to create Daytona workspace: ${error}`);
    }
  }

  async get(sandboxId: string): Promise<SandboxInfo> {
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      const workspaceInfo = await this.getWorkspaceInfo(workspace.id);
      
      const sandboxInfo: SandboxInfo = {
        id: sandboxId,
        status: this.mapDaytonaStatusToSandboxStatus(workspaceInfo.status),
        createdAt: new Date(workspaceInfo.createdAt),
        lastUsedAt: workspaceInfo.lastAccessedAt ? new Date(workspaceInfo.lastAccessedAt) : undefined,
        environment: {
          env: {},
          cwd: '/workspace',
          timeout: 300000,
          memoryLimit: 2048,
        },
        resourceUsage: workspaceInfo.resources ? {
          cpuUsage: parseFloat(workspaceInfo.resources.cpu) || 0,
          memoryUsage: parseFloat(workspaceInfo.resources.memory) || 0,
          diskUsage: parseFloat(workspaceInfo.resources.disk) || 0,
        } : undefined,
      };

      return sandboxInfo;
    } catch (error) {
      this.logger.error('Failed to get workspace info', { sandboxId, error });
      throw new Error(`Failed to get workspace info: ${error}`);
    }
  }

  async list(): Promise<SandboxInfo[]> {
    try {
      const workspaces = await this.listWorkspaces();
      
      const sandboxes: SandboxInfo[] = workspaces.map(workspace => ({
        id: workspace.name,
        status: this.mapDaytonaStatusToSandboxStatus(workspace.status),
        createdAt: new Date(workspace.createdAt),
        lastUsedAt: workspace.lastAccessedAt ? new Date(workspace.lastAccessedAt) : undefined,
        environment: {
          env: {},
          cwd: '/workspace',
          timeout: 300000,
          memoryLimit: 2048,
        },
        resourceUsage: workspace.resources ? {
          cpuUsage: parseFloat(workspace.resources.cpu) || 0,
          memoryUsage: parseFloat(workspace.resources.memory) || 0,
          diskUsage: parseFloat(workspace.resources.disk) || 0,
        } : undefined,
      }));

      return sandboxes;
    } catch (error) {
      this.logger.error('Failed to list workspaces', { error });
      throw new Error(`Failed to list workspaces: ${error}`);
    }
  }

  async destroy(sandboxId: string): Promise<void> {
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await this.deleteWorkspace(workspace.id);
      this.activeWorkspaces.delete(sandboxId);
      this.logger.info('Daytona workspace destroyed', { sandboxId });
    } catch (error) {
      this.logger.error('Failed to destroy workspace', { sandboxId, error });
      throw new Error(`Failed to destroy workspace: ${error}`);
    }
  }

  async execute(sandboxId: string, config: ProcessConfig): Promise<ProcessResult> {
    this.validateProcessConfig(config);
    
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const startTime = Date.now();
    
    try {
      const result = await this.executeInWorkspace(workspace.id, config);
      const executionTime = Date.now() - startTime;

      this.logger.info('Command executed in Daytona workspace', {
        sandboxId,
        command: config.command,
        exitCode: result.exitCode,
        executionTime,
      });

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error('Failed to execute command in workspace', {
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
    // This would require WebSocket or SSE connection to Daytona workspace
    throw new Error('Streaming execution not yet supported for Daytona sandbox');
  }

  async uploadFiles(sandboxId: string, files: FileOperation[]): Promise<void> {
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await this.uploadFilesToWorkspace(workspace.id, files);
      this.logger.info('Files uploaded to workspace', { sandboxId, fileCount: files.length });
    } catch (error) {
      this.logger.error('Failed to upload files', { sandboxId, error });
      throw new Error(`Failed to upload files: ${error}`);
    }
  }

  async downloadFiles(sandboxId: string, files: FileOperation[]): Promise<void> {
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await this.downloadFilesFromWorkspace(workspace.id, files);
      this.logger.info('Files downloaded from workspace', { sandboxId, fileCount: files.length });
    } catch (error) {
      this.logger.error('Failed to download files', { sandboxId, error });
      throw new Error(`Failed to download files: ${error}`);
    }
  }

  async getResourceUsage(sandboxId: string): Promise<ResourceUsage> {
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      const workspaceInfo = await this.getWorkspaceInfo(workspace.id);
      
      return {
        cpuUsage: workspaceInfo.resources ? parseFloat(workspaceInfo.resources.cpu) : 0,
        memoryUsage: workspaceInfo.resources ? parseFloat(workspaceInfo.resources.memory) : 0,
        diskUsage: workspaceInfo.resources ? parseFloat(workspaceInfo.resources.disk) : 0,
      };
    } catch (error) {
      this.logger.error('Failed to get resource usage', { sandboxId, error });
      return {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
      };
    }
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
    const workspace = this.activeWorkspaces.get(sandboxId);
    if (!workspace) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await this.restartWorkspace(workspace.id);
      await this.waitForWorkspace(workspace.id);
      
      return this.get(sandboxId);
    } catch (error) {
      this.logger.error('Failed to restart workspace', { sandboxId, error });
      throw new Error(`Failed to restart workspace: ${error}`);
    }
  }

  // Private methods for Daytona API interactions
  // These would be implemented based on Daytona's actual API

  private async createWorkspace(config: DaytonaWorkspaceConfig): Promise<DaytonaWorkspaceInfo> {
    // Placeholder implementation - would use actual Daytona API
    return {
      id: `workspace_${Date.now()}`,
      name: config.name,
      status: 'creating',
      createdAt: new Date().toISOString(),
    };
  }

  private async getWorkspaceInfo(workspaceId: string): Promise<DaytonaWorkspaceInfo> {
    // Placeholder implementation - would use actual Daytona API
    const workspace = Array.from(this.activeWorkspaces.values()).find(w => w.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  private async listWorkspaces(): Promise<DaytonaWorkspaceInfo[]> {
    // Placeholder implementation - would use actual Daytona API
    return Array.from(this.activeWorkspaces.values());
  }

  private async deleteWorkspace(workspaceId: string): Promise<void> {
    // Placeholder implementation - would use actual Daytona API
    this.logger.info('Deleting workspace', { workspaceId });
  }

  private async executeInWorkspace(workspaceId: string, config: ProcessConfig): Promise<ProcessResult> {
    // Placeholder implementation - would use actual Daytona API
    return {
      exitCode: 0,
      stdout: `Executed: ${config.command} ${config.args?.join(' ') || ''}`,
      stderr: '',
      executionTime: 1000,
      status: 'completed',
      pid: Math.floor(Math.random() * 10000),
    };
  }

  private async uploadFilesToWorkspace(workspaceId: string, files: FileOperation[]): Promise<void> {
    // Placeholder implementation - would use actual Daytona API
    this.logger.info('Uploading files to workspace', { workspaceId, fileCount: files.length });
  }

  private async downloadFilesFromWorkspace(workspaceId: string, files: FileOperation[]): Promise<void> {
    // Placeholder implementation - would use actual Daytona API
    this.logger.info('Downloading files from workspace', { workspaceId, fileCount: files.length });
  }

  private async waitForWorkspace(workspaceId: string, maxWaitTime = 300000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const workspace = await this.getWorkspaceInfo(workspaceId);
        
        if (workspace.status === 'running') {
          return;
        }
        
        if (workspace.status === 'error') {
          throw new Error(`Workspace creation failed`);
        }

        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        this.logger.error('Error checking workspace status', { workspaceId, error });
        throw error;
      }
    }

    throw new Error('Workspace creation timed out');
  }

  private async restartWorkspace(workspaceId: string): Promise<void> {
    // Placeholder implementation - would use actual Daytona API
    this.logger.info('Restarting workspace', { workspaceId });
  }

  private mapDaytonaStatusToSandboxStatus(status: DaytonaWorkspaceInfo['status']): SandboxInfo['status'] {
    switch (status) {
      case 'creating':
        return 'initializing';
      case 'running':
        return 'ready';
      case 'stopped':
        return 'stopped';
      case 'error':
        return 'error';
      case 'deleting':
        return 'stopped';
      default:
        return 'error';
    }
  }
}