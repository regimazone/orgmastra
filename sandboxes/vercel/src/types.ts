import type { SandboxConfig } from '@mastra/core';

/**
 * Vercel sandbox configuration for Mastra integration
 */
export interface VercelSandboxConfig extends SandboxConfig {
  /** Vercel credentials - can be API token or full credentials object */
  credentials?: VercelCredentials | string;
}

/**
 * Vercel credentials object
 */
export interface VercelCredentials {
  /** API token */
  token: string;
  /** Team ID (optional) */
  teamId?: string;
}

/**
 * Vercel sandbox creation parameters matching their API
 */
export interface VercelSandboxCreateParams {
  /** Source code configuration */
  source?: VercelSandboxSource;
  /** Ports to expose */
  ports?: number[];
  /** Timeout in seconds */
  timeout?: number;
  /** Resource allocation */
  resources?: {
    vcpus: number;
  };
  /** Runtime environment */
  runtime?: 'node22' | 'python3.13';
}

/**
 * Vercel sandbox source configuration
 */
export type VercelSandboxSource = 
  | {
      type: 'git';
      url: string;
      depth?: number;
      revision?: string;
    }
  | {
      type: 'git';
      url: string;
      username: string;
      password: string;
      depth?: number;
      revision?: string;
    }
  | {
      type: 'tarball';
      url: string;
    };

/**
 * Vercel command execution parameters
 */
export interface VercelCommandParams {
  /** Command to execute */
  cmd: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Execute with sudo privileges */
  sudo?: boolean;
  /** Run in detached mode */
  detached?: boolean;
}

/**
 * Vercel file operation for reading files
 */
export interface VercelFileRead {
  /** File path in sandbox */
  path: string;
  /** Working directory context */
  cwd?: string;
}

/**
 * Vercel file operation for writing files
 */
export interface VercelFileWrite {
  /** File path in sandbox */
  path: string;
  /** File content as Buffer */
  content: Buffer;
}

/**
 * Internal mapping of Mastra sandbox IDs to Vercel sandbox instances
 */
export interface VercelSandboxMapping {
  /** Mastra sandbox ID */
  mastraId: string;
  /** Vercel sandbox ID */
  vercelId: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last access timestamp */
  lastAccessedAt?: Date;
}