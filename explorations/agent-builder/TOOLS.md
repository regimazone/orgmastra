# Tools

Technical specifications for Agent Builder tools.

## Code Generation Tools

### getCode

Generates code templates for various Mastra components. Combines pre-validated snippets with dynamic generation to create agents, tools, workflows, or configuration snippets. Returns code ready to write to files.

```typescript
createTool({
  id: 'get-code',
  inputSchema: z.object({
    templateType: z.enum(['agent', 'tool', 'workflow', 'snippet']),
    features: z.array(z.string()).optional(),
    requirements: z.array(z.string()).optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    modelProvider: z.enum(['openai', 'anthropic', 'google']).optional()
  }),
  outputSchema: z.object({
    code: z.string(),
    imports: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    filePath: z.string().optional()
  })
})
```

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

### patternLibrary

Searches a library of successful agent implementations. Given requirements like ['customer support', 'ticket creation'], it finds similar agents through semantic search and returns their patterns. Each successful generation adds to the library.

```typescript
createTool({
  id: 'pattern-library',
  inputSchema: z.object({
    requirements: z.array(z.string()),
    domain: z.string().optional(),
    complexity: z.enum(['simple', 'moderate', 'complex'])
  }),
  outputSchema: z.object({
    patterns: z.array(z.object({
      name: z.string(),
      similarity: z.number(),
      template: z.string()
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