# Tools

Technical specifications for Agent Builder tools.

## Code Generation Tools

### configSnippetBuilder

Generates configuration snippets for specific features.

```typescript
createTool({
  id: 'config-snippet-builder',
  inputSchema: z.object({
    features: z.array(z.enum([
      'basic-agent',
      'mcp-integration', 
      'custom-tools',
      'memory-semantic',
      'voice-enabled',
      'workflow-integration'
    ])),
    agentType: z.enum(['assistant', 'task-worker', 'orchestrator']),
    modelProvider: z.enum(['openai', 'anthropic', 'google'])
  }),
  outputSchema: z.object({
    imports: z.string(),
    configuration: z.string(),
    setup: z.string(),
    usage: z.string()
  })
})
```

### projectScaffolder

Creates complete project structure.

```typescript
createTool({
  id: 'project-scaffolder',
  inputSchema: z.object({
    projectName: z.string(),
    projectType: z.enum(['standalone', 'api', 'nextjs']),
    features: z.array(z.string()),
    packageManager: z.enum(['npm', 'pnpm', 'yarn'])
  })
})
```

### codeWriter

Writes specific Mastra components.

```typescript
createTool({
  id: 'code-writer',
  inputSchema: z.object({
    componentType: z.enum(['agent', 'tool', 'workflow']),
    specification: z.object({
      name: z.string(),
      description: z.string(),
      requirements: z.array(z.string())
    }),
    targetPath: z.string()
  })
})
```

## AST Transform Tool

### mastraCodeTransform

Applies Mastra-specific code transformations.

```typescript
createTool({
  id: 'mastra-code-transform',
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

### validator

Validates generated code.

```typescript
createTool({
  id: 'validator',
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

### patternMatcher

Finds similar agent patterns.

```typescript
createTool({
  id: 'pattern-matcher',
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