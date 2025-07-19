import { MastraBase } from '../base';
import { RegisteredLogger } from '../logger/constants';
import type {
  SandboxConfig,
  SandboxInfo,
  ProcessConfig,
  ProcessResult,
  StreamingProcessResult,
  FileOperation,
  ResourceUsage,
} from './types';

/**
 * Abstract base class for sandbox implementations
 * 
 * Provides a unified interface for different sandbox providers like Vercel, Daytona, etc.
 * Each implementation handles the specific API calls and authentication for their platform.
 */
export abstract class MastraSandbox extends MastraBase {
  constructor({ name }: { name?: string } = {}) {
    super({ 
      name: name || 'MastraSandbox', 
      component: RegisteredLogger.SANDBOX as any 
    });
  }

  /**
   * Create a new sandbox instance
   * @param config - Configuration for the sandbox
   * @returns Promise resolving to sandbox information
   */
  abstract create(config: SandboxConfig): Promise<SandboxInfo>;

  /**
   * Get information about an existing sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @returns Promise resolving to sandbox information
   */
  abstract get(sandboxId: string): Promise<SandboxInfo>;

  /**
   * List all available sandboxes
   * @returns Promise resolving to array of sandbox information
   */
  abstract list(): Promise<SandboxInfo[]>;

  /**
   * Stop and remove a sandbox instance
   * @param sandboxId - Unique identifier for the sandbox
   * @returns Promise resolving when sandbox is destroyed
   */
  abstract destroy(sandboxId: string): Promise<void>;

  /**
   * Execute a command in the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @param config - Process execution configuration
   * @returns Promise resolving to process execution result
   */
  abstract execute(sandboxId: string, config: ProcessConfig): Promise<ProcessResult>;

  /**
   * Execute a command in the sandbox with streaming output
   * @param sandboxId - Unique identifier for the sandbox
   * @param config - Process execution configuration
   * @returns Promise resolving to streaming process result
   */
  abstract executeStream(sandboxId: string, config: ProcessConfig): Promise<StreamingProcessResult>;

  /**
   * Upload files to the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @param files - Array of file operations to perform
   * @returns Promise resolving when upload is complete
   */
  abstract uploadFiles(sandboxId: string, files: FileOperation[]): Promise<void>;

  /**
   * Download files from the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @param files - Array of file operations to perform
   * @returns Promise resolving when download is complete
   */
  abstract downloadFiles(sandboxId: string, files: FileOperation[]): Promise<void>;

  /**
   * Get current resource usage for the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @returns Promise resolving to resource usage information
   */
  abstract getResourceUsage(sandboxId: string): Promise<ResourceUsage>;

  /**
   * Check if the sandbox is ready for operations
   * @param sandboxId - Unique identifier for the sandbox
   * @returns Promise resolving to boolean indicating readiness
   */
  abstract isReady(sandboxId: string): Promise<boolean>;

  /**
   * Restart a sandbox instance
   * @param sandboxId - Unique identifier for the sandbox
   * @returns Promise resolving to updated sandbox information
   */
  abstract restart(sandboxId: string): Promise<SandboxInfo>;

  /**
   * Create a snapshot of the current sandbox state
   * @param sandboxId - Unique identifier for the sandbox
   * @param snapshotName - Name for the snapshot
   * @returns Promise resolving to snapshot ID
   */
  abstract createSnapshot?(sandboxId: string, snapshotName: string): Promise<string>;

  /**
   * Restore sandbox from a snapshot
   * @param sandboxId - Unique identifier for the sandbox
   * @param snapshotId - Snapshot ID to restore from
   * @returns Promise resolving when restore is complete
   */
  abstract restoreSnapshot?(sandboxId: string, snapshotId: string): Promise<void>;

  /**
   * Get logs from the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @param options - Log retrieval options
   * @returns Promise resolving to log content
   */
  abstract getLogs?(
    sandboxId: string, 
    options?: { 
      lines?: number; 
      since?: Date; 
      follow?: boolean; 
    }
  ): Promise<string>;

  /**
   * Set environment variables in the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @param env - Environment variables to set
   * @returns Promise resolving when variables are set
   */
  abstract setEnvironmentVariables?(
    sandboxId: string, 
    env: Record<string, string>
  ): Promise<void>;

  /**
   * Get environment variables from the sandbox
   * @param sandboxId - Unique identifier for the sandbox
   * @returns Promise resolving to environment variables
   */
  abstract getEnvironmentVariables?(sandboxId: string): Promise<Record<string, string>>;

  /**
   * Helper method to validate sandbox configuration
   * @param config - Sandbox configuration to validate
   * @protected
   */
  protected validateConfig(config: SandboxConfig): void {
    if (config.timeout && config.timeout <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    if (config.memoryLimit && config.memoryLimit <= 0) {
      throw new Error('Memory limit must be a positive number');
    }
    if (config.cpuLimit && (config.cpuLimit <= 0 || config.cpuLimit > 100)) {
      throw new Error('CPU limit must be between 1 and 100');
    }
  }

  /**
   * Helper method to validate process configuration
   * @param config - Process configuration to validate
   * @protected
   */
  protected validateProcessConfig(config: ProcessConfig): void {
    if (!config.command || config.command.trim().length === 0) {
      throw new Error('Command is required and cannot be empty');
    }
  }

  /**
   * Helper method to generate a unique sandbox ID
   * @returns Generated sandbox ID
   * @protected
   */
  protected generateSandboxId(): string {
    return `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}