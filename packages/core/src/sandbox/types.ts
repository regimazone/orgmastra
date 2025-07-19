import type { ReadableStream } from 'stream/web';

/**
 * Process execution status
 */
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'killed' | 'timeout';

/**
 * Environment setup for the sandbox
 */
export interface SandboxEnvironment {
  /** Environment variables to set in the sandbox */
  env?: Record<string, string>;
  /** Working directory for the process */
  cwd?: string;
  /** Timeout for the process in milliseconds */
  timeout?: number;
  /** Memory limit in MB */
  memoryLimit?: number;
  /** CPU limit as a percentage */
  cpuLimit?: number;
}

/**
 * File upload/download configuration
 */
export interface FileOperation {
  /** Local file path */
  localPath: string;
  /** Remote sandbox path */
  sandboxPath: string;
  /** File permissions (optional) */
  permissions?: string;
}

/**
 * Process execution configuration
 */
export interface ProcessConfig extends SandboxEnvironment {
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Whether to capture stdout */
  captureOutput?: boolean;
  /** Whether to capture stderr */
  captureError?: boolean;
  /** Whether to run in interactive mode */
  interactive?: boolean;
  /** Input to provide to the process */
  input?: string;
}

/**
 * Process execution result
 */
export interface ProcessResult {
  /** Process exit code */
  exitCode: number;
  /** Process stdout */
  stdout: string;
  /** Process stderr */
  stderr: string;
  /** Process execution time in milliseconds */
  executionTime: number;
  /** Process status */
  status: ProcessStatus;
  /** Process ID (if available) */
  pid?: number;
}

/**
 * Streaming process execution result
 */
export interface StreamingProcessResult {
  /** Process ID */
  pid: number;
  /** Stdout stream */
  stdout?: ReadableStream<Uint8Array>;
  /** Stderr stream */
  stderr?: ReadableStream<Uint8Array>;
  /** Promise that resolves when process completes */
  completion: Promise<ProcessResult>;
  /** Kill the process */
  kill: (signal?: string) => Promise<void>;
}

/**
 * Sandbox instance information
 */
export interface SandboxInfo {
  /** Unique sandbox identifier */
  id: string;
  /** Sandbox status */
  status: 'initializing' | 'ready' | 'busy' | 'stopped' | 'error';
  /** When the sandbox was created */
  createdAt: Date;
  /** When the sandbox was last used */
  lastUsedAt?: Date;
  /** Sandbox environment configuration */
  environment: SandboxEnvironment;
  /** Current resource usage */
  resourceUsage?: ResourceUsage;
}

/**
 * Resource usage information
 */
export interface ResourceUsage {
  /** CPU usage percentage */
  cpuUsage?: number;
  /** Memory usage in MB */
  memoryUsage?: number;
  /** Disk usage in MB */
  diskUsage?: number;
  /** Network I/O statistics */
  networkIO?: {
    bytesReceived: number;
    bytesSent: number;
  };
}

/**
 * Sandbox creation configuration
 */
export interface SandboxConfig extends SandboxEnvironment {
  /** Template to use for initialization */
  template?: string;
  /** Files to upload during initialization */
  initialFiles?: FileOperation[];
  /** Setup commands to run after creation */
  setupCommands?: string[];
  /** Whether to persist the sandbox */
  persistent?: boolean;
  /** Sandbox name/label */
  name?: string;
}