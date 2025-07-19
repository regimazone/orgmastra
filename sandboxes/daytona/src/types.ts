import type { SandboxConfig } from '@mastra/core';

/**
 * Daytona sandbox configuration
 */
export interface DaytonaSandboxConfig extends SandboxConfig {
  /** Daytona API key */
  apiKey: string;
  /** Daytona server URL */
  serverUrl: string;
  /** Default workspace template */
  defaultTemplate?: string;
  /** Default Git provider configuration */
  gitProvider?: {
    provider: 'github' | 'gitlab' | 'bitbucket';
    username?: string;
    token?: string;
  };
}

/**
 * Daytona workspace configuration
 */
export interface DaytonaWorkspaceConfig {
  /** Workspace name */
  name: string;
  /** Repository URL */
  repositoryUrl?: string;
  /** Branch to use */
  branch?: string;
  /** Workspace template */
  template?: string;
  /** IDE preference */
  ide?: 'vscode' | 'idea' | 'vim';
  /** Environment variables */
  env?: Record<string, string>;
  /** Devcontainer configuration */
  devcontainer?: {
    image?: string;
    features?: string[];
    customizations?: Record<string, any>;
  };
}

/**
 * Daytona workspace information
 */
export interface DaytonaWorkspaceInfo {
  /** Workspace ID */
  id: string;
  /** Workspace name */
  name: string;
  /** Workspace status */
  status: 'creating' | 'running' | 'stopped' | 'error' | 'deleting';
  /** Repository information */
  repository?: {
    url: string;
    branch: string;
  };
  /** Creation timestamp */
  createdAt: string;
  /** Last accessed timestamp */
  lastAccessedAt?: string;
  /** Workspace URL */
  url?: string;
  /** Resource usage */
  resources?: {
    cpu: string;
    memory: string;
    disk: string;
  };
}

/**
 * Daytona project template
 */
export interface DaytonaProjectTemplate {
  /** Template name */
  name: string;
  /** Template description */
  description?: string;
  /** Git repository URL */
  repositoryUrl?: string;
  /** Prebuild configuration */
  prebuild?: {
    commands: string[];
  };
  /** Default environment variables */
  defaultEnv?: Record<string, string>;
}