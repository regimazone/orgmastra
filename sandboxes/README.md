# Mastra Sandboxes

This directory contains implementations of the `MastraSandbox` base class for different sandbox providers.

## Available Sandbox Providers

### Vercel Sandbox
- **Package**: `@mastra/sandbox-vercel`
- **Description**: Sandbox implementation using Vercel's serverless functions and edge runtime
- **Use Cases**: Web development, serverless execution, edge computing

### Daytona Sandbox  
- **Package**: `@mastra/sandbox-daytona`
- **Description**: Development environment sandbox using Daytona workspaces
- **Use Cases**: Development environments, collaborative coding, full-stack development

## Usage

```typescript
import { VercelSandbox } from '@mastra/sandbox-vercel';
import { DaytonaSandbox } from '@mastra/sandbox-daytona';

// Using Vercel Sandbox
const vercelSandbox = new VercelSandbox({
  apiKey: 'your-vercel-api-key',
  teamId: 'your-team-id'
});

// Create and use a sandbox
const sandbox = await vercelSandbox.create({
  name: 'my-sandbox',
  template: 'node18',
  env: {
    NODE_ENV: 'development'
  }
});

// Execute commands
const result = await vercelSandbox.execute(sandbox.id, {
  command: 'npm',
  args: ['install'],
  captureOutput: true
});

console.log(result.stdout);

// Using Daytona Sandbox
const daytonaSandbox = new DaytonaSandbox({
  apiKey: 'your-daytona-api-key',
  workspace: 'my-workspace'
});
```

## Creating a New Sandbox Provider

To create a new sandbox provider:

1. Create a new package directory: `sandboxes/my-provider/`
2. Implement the `MastraSandbox` abstract class
3. Add your provider-specific configuration and authentication
4. Implement all required methods according to the provider's API
5. Add comprehensive error handling and logging
6. Include tests and documentation

Example structure:
```
sandboxes/my-provider/
├── src/
│   ├── index.ts
│   ├── types.ts
│   └── my-provider-sandbox.ts
├── package.json
├── README.md
└── tsconfig.json
```

## Base Class Methods

The `MastraSandbox` base class provides the following abstract methods that must be implemented:

### Required Methods
- `create(config: SandboxConfig): Promise<SandboxInfo>`
- `get(sandboxId: string): Promise<SandboxInfo>`
- `list(): Promise<SandboxInfo[]>`
- `destroy(sandboxId: string): Promise<void>`
- `execute(sandboxId: string, config: ProcessConfig): Promise<ProcessResult>`
- `executeStream(sandboxId: string, config: ProcessConfig): Promise<StreamingProcessResult>`
- `uploadFiles(sandboxId: string, files: FileOperation[]): Promise<void>`
- `downloadFiles(sandboxId: string, files: FileOperation[]): Promise<void>`
- `getResourceUsage(sandboxId: string): Promise<ResourceUsage>`
- `isReady(sandboxId: string): Promise<boolean>`
- `restart(sandboxId: string): Promise<SandboxInfo>`

### Optional Methods
- `createSnapshot?(sandboxId: string, snapshotName: string): Promise<string>`
- `restoreSnapshot?(sandboxId: string, snapshotId: string): Promise<void>`
- `getLogs?(sandboxId: string, options?: LogOptions): Promise<string>`
- `setEnvironmentVariables?(sandboxId: string, env: Record<string, string>): Promise<void>`
- `getEnvironmentVariables?(sandboxId: string): Promise<Record<string, string>>`

## Contributing

When contributing a new sandbox provider:

1. Follow the existing code patterns and TypeScript conventions
2. Include comprehensive error handling
3. Add unit and integration tests
4. Document the configuration options and usage examples
5. Ensure compatibility with the latest `MastraSandbox` interface
6. Add the provider to this README file