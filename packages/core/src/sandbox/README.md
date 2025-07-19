# Mastra Sandbox Infrastructure

The Mastra Sandbox infrastructure provides a unified interface for executing code in isolated environments across different cloud providers and platforms.

## Overview

The sandbox system consists of:

- **Base Class (`MastraSandbox`)**: Abstract base class defining the sandbox interface
- **Type System**: Comprehensive TypeScript interfaces for all sandbox operations  
- **Provider Implementations**: Concrete implementations for different sandbox providers
- **Unified API**: Consistent interface regardless of the underlying provider

## Core Concepts

### Sandbox Lifecycle

1. **Create**: Initialize a new isolated environment
2. **Execute**: Run commands and code within the sandbox
3. **Manage**: Upload/download files, monitor resources
4. **Destroy**: Clean up and terminate the sandbox

### Key Features

- **Cross-Platform**: Unified interface for different sandbox providers
- **Streaming Support**: Real-time output for long-running processes
- **File Operations**: Upload and download files to/from sandboxes
- **Resource Monitoring**: Track CPU, memory, and disk usage
- **Environment Management**: Custom environment variables and configurations

## Base Class Interface

```typescript
import { MastraSandbox } from '@mastra/core';

abstract class MastraSandbox {
  // Lifecycle methods
  abstract create(config: SandboxConfig): Promise<SandboxInfo>;
  abstract destroy(sandboxId: string): Promise<void>;
  abstract get(sandboxId: string): Promise<SandboxInfo>;
  abstract list(): Promise<SandboxInfo[]>;

  // Execution methods
  abstract execute(sandboxId: string, config: ProcessConfig): Promise<ProcessResult>;
  abstract executeStream(sandboxId: string, config: ProcessConfig): Promise<StreamingProcessResult>;

  // File operations
  abstract uploadFiles(sandboxId: string, files: FileOperation[]): Promise<void>;
  abstract downloadFiles(sandboxId: string, files: FileOperation[]): Promise<void>;

  // Management methods
  abstract getResourceUsage(sandboxId: string): Promise<ResourceUsage>;
  abstract isReady(sandboxId: string): Promise<boolean>;
  abstract restart(sandboxId: string): Promise<SandboxInfo>;
}
```

## Type Definitions

### SandboxConfig
Configuration for creating a new sandbox:

```typescript
interface SandboxConfig {
  name?: string;
  env?: Record<string, string>;
  timeout?: number;
  memoryLimit?: number;
  cpuLimit?: number;
  source?: SandboxSource;
}
```

### ProcessConfig
Configuration for executing commands:

```typescript
interface ProcessConfig {
  command: string;
  args?: string[];
  environment?: {
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
  };
  sudo?: boolean;
}
```

### ProcessResult
Result of command execution:

```typescript
interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTime: number;
  status: ProcessStatus;
  pid?: number;
}
```

## Available Providers

### Vercel Sandbox
- **Location**: `@mastra/sandbox-vercel`
- **Use Cases**: Serverless execution, edge computing, quick scripts
- **Features**: Linux MicroVMs, Node.js/Python runtimes, Git source support

### Daytona Sandbox  
- **Location**: `@mastra/sandbox-daytona`
- **Use Cases**: Development environments, complex builds, long-running processes
- **Features**: Full development workspaces, Git integration, persistent environments

## Usage Examples

### Basic Usage

```typescript
import { VercelSandbox } from '@mastra/sandbox-vercel';

const sandbox = new VercelSandbox({
  credentials: { token: process.env.VERCEL_TOKEN! }
});

// Create sandbox
const info = await sandbox.create({
  name: 'my-sandbox',
  runtime: 'node22',
  timeout: 30000,
});

// Execute command
const result = await sandbox.execute(info.id, {
  command: 'node',
  args: ['-e', 'console.log("Hello World!")'],
});

console.log(result.stdout); // "Hello World!"

// Clean up
await sandbox.destroy(info.id);
```

### Streaming Execution

```typescript
const stream = await sandbox.executeStream(sandboxId, {
  command: 'npm',
  args: ['test'],
});

// Process streaming output
if (stream.stdout) {
  const reader = stream.stdout.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(new TextDecoder().decode(value));
  }
}
```

### File Operations

```typescript
// Upload files
await sandbox.uploadFiles(sandboxId, [
  { localPath: './src/app.js', sandboxPath: '/workspace/app.js' },
  { localPath: './package.json', sandboxPath: '/workspace/package.json' },
]);

// Download results
await sandbox.downloadFiles(sandboxId, [
  { sandboxPath: '/workspace/dist', localPath: './output' },
]);
```

## Provider Selection

Choose the right provider based on your needs:

- **Vercel**: Quick executions, serverless workloads, edge computing
- **Daytona**: Development environments, complex builds, persistent workspaces

## Error Handling

All sandbox operations can throw errors. Always wrap calls in try-catch blocks:

```typescript
try {
  const result = await sandbox.execute(sandboxId, config);
} catch (error) {
  console.error('Execution failed:', error.message);
}
```

## Logging

The sandbox infrastructure uses Mastra's logging system with the `SANDBOX` component:

```typescript
// Logs are automatically generated for:
// - Sandbox creation/destruction
// - Command execution
// - File operations
// - Error conditions
```

## Best Practices

1. **Always clean up**: Call `destroy()` when done with a sandbox
2. **Set timeouts**: Prevent hanging processes with appropriate timeouts
3. **Monitor resources**: Use `getResourceUsage()` for long-running tasks
4. **Handle errors**: Wrap all operations in proper error handling
5. **Use appropriate providers**: Match provider capabilities to your use case

## Contributing

To add a new sandbox provider:

1. Extend `MastraSandbox` base class
2. Implement all abstract methods
3. Add provider-specific types
4. Create comprehensive tests
5. Add usage examples

See existing implementations in `sandboxes/` for reference patterns.