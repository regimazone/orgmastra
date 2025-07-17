# Tools

Technical specifications for Agent Builder tools.

## Pattern Library Tool

### patternLibrary

Provides code patterns by name. Without a pattern name, lists all available patterns. With a pattern name, returns the complete code for that pattern.

```typescript
createTool({
  id: 'pattern-library',
  inputSchema: z.object({
    patternName: z.string().optional()
  }),
  outputSchema: z.object({
    patterns: z.array(z.string()).optional(), // when listing all
    code: z.string().optional(),
    imports: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    description: z.string().optional(),
    usage: z.string().optional(),
    testingGuide: z.string().optional() // how to write tests for this pattern
  })
})
```

Example patterns:
- `agent` - Basic agent setup
- `agent.withTools` - Agent with custom tools
- `agent.withMemory` - Agent with memory integration
- `agentNetwork` - Agent network configuration
- `memory` - Basic memory configuration
- `memory.withLibsql` - Memory with LibSQL storage
- `memory.withPostgres` - Memory with PostgreSQL
- `workflows` - Basic workflow
- `workflow.withSteps` - Multi-step workflow
- `tool` - Custom tool template
- `mcp` - MCP server setup

## Implementation Guide Tool

### implementationGuide

Provides concise explanations of how Mastra features work, when to use them, and why. Returns 2-3 sentence descriptions focused on practical usage.

```typescript
createTool({
  id: 'implementation-guide',
  inputSchema: z.object({
    feature: z.string()
  }),
  outputSchema: z.object({
    description: z.string(),
    whenToUse: z.string(),
    example: z.string().optional()
  })
})
```

Example features:
- `agent` - Core agent concepts and usage
- `memory` - Memory system capabilities
- `workflows` - Workflow orchestration
- `tools` - Tool creation and integration
- `mcp` - MCP server integration
- `evals` - Evaluation framework

## Project Management Tool

### manageProject

Handles complete project management - creates project structures, manages dependencies, and keeps packages up to date. Combines scaffolding capabilities with package management for a unified project tool.

```typescript
createTool({
  id: 'manage-project',
  inputSchema: z.object({
    action: z.enum(['create', 'install', 'upgrade', 'check']),
    projectName: z.string().optional(), // for create action
    projectType: z.enum(['standalone', 'api', 'nextjs']).optional(), // for create
    features: z.array(z.string()).optional(),
    packageManager: z.enum(['npm', 'pnpm', 'yarn']).optional(),
    packages: z.array(z.object({
      name: z.string(),
      version: z.string().optional()
    })).optional(), // for install/upgrade actions
    projectPath: z.string().optional() // for package actions
  }),
  outputSchema: z.object({
    success: z.boolean(),
    projectPath: z.string().optional(),
    installed: z.array(z.string()).optional(),
    upgraded: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional()
  })
})
```

## AST Transform Tool

### rewriteCode

Uses AST-based transformations to modify code reliably. Unlike find/replace which breaks with formatting variations, AST understands code structure.

```typescript
createTool({
  id: 'rewrite-code',
  inputSchema: z.object({
    file: z.string(),
    transform: z.enum([
      'add-tool-to-agent',
      'update-agent-config',
      'add-memory-to-agent',
      'make-agent-dynamic',
      'add-workflow-to-agent',
      'add-error-handling'
    ]),
    params: z.record(z.any())
  })
})
```

Transform examples:

```typescript
// Add tool
{
  transform: 'add-tool-to-agent',
  agentName: 'support',
  toolName: 'searchKB'
}

// Update config
{
  transform: 'update-agent-config',
  agentName: 'analyst',
  updates: {
    changeModel: 'gpt-4o',
    addMemory: true
  }
}
```

## Validation Tools

### validateCode

Runs generated code through TypeScript compilation, Zod schema validation, import resolution, test execution, and integration checks. Catches errors before code reaches users.

```typescript
createTool({
  id: 'validate-code',
  inputSchema: z.object({
    projectPath: z.string(),
    validationType: z.array(z.enum([
      'types',
      'schemas', 
      'tests',
      'integration'
    ]))
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    errors: z.array(z.object({
      type: z.string(),
      message: z.string(),
      location: z.string()
    }))
  })
})
```


## Tool Implementation Notes

- All tools return structured data
- Error handling built into each tool
- Tools are composable (can chain outputs)
- Validation happens at schema level
- AST transforms guarantee valid syntax