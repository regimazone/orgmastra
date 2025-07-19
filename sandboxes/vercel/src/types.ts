import type { SandboxConfig } from '@mastra/core';

/**
 * Vercel sandbox configuration
 */
export interface VercelSandboxConfig extends SandboxConfig {
  /** Vercel API token */
  apiToken: string;
  /** Vercel team ID (optional) */
  teamId?: string;
  /** Vercel project ID (optional, for project-specific sandboxes) */
  projectId?: string;
  /** Function runtime (nodejs or edge) */
  runtime?: 'nodejs' | 'edge';
  /** Function region */
  region?: string;
  /** Function memory limit in MB */
  functionMemory?: number;
  /** Maximum function duration in seconds */
  maxDuration?: number;
}

/**
 * Vercel function deployment configuration
 */
export interface VercelFunctionConfig {
  /** Function name */
  name: string;
  /** Function source code */
  source: string;
  /** Function runtime */
  runtime: 'nodejs' | 'edge';
  /** Environment variables */
  env?: Record<string, string>;
  /** Function configuration */
  config?: {
    runtime?: string;
    memory?: number;
    maxDuration?: number;
    regions?: string[];
  };
}

/**
 * Vercel deployment information
 */
export interface VercelDeploymentInfo {
  /** Deployment ID */
  id: string;
  /** Deployment URL */
  url: string;
  /** Deployment state */
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  /** Creation timestamp */
  createdAt: number;
  /** Ready timestamp */
  readyAt?: number;
  /** Project ID */
  projectId?: string;
  /** Team ID */
  teamId?: string;
}

/**
 * Vercel edge config for storing sandbox state
 */
export interface VercelEdgeConfig {
  /** Edge config ID */
  id: string;
  /** Edge config name */
  name: string;
  /** Edge config items */
  items: Record<string, any>;
}

/**
 * Vercel function execution environment
 */
export interface VercelExecutionEnvironment {
  /** Vercel region */
  region: string;
  /** Function URL */
  url: string;
  /** Function ID */
  functionId: string;
  /** Deployment ID */
  deploymentId: string;
}