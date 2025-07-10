# Interfaces

All the ways to use the Mastra Agent Builder.

## Programmatic API

### Basic Generation

```typescript
import { agentBuilder } from '@mastra/agent-builder';

// Simple prompt
const response = await agentBuilder.generate(
  "Create a GitHub issue monitoring agent"
);

// Continue conversation
const enhanced = await agentBuilder.generate(
  "Add webhook support for real-time updates"
);
```

### Structured Output

```typescript
const agentSpec = z.object({
  code: z.string(),
  files: z.array(z.object({
    path: z.string(),
    content: z.string()
  })),
  dependencies: z.array(z.string()),
  instructions: z.string()
});

const result = await agentBuilder.generate(prompt, { 
  output: agentSpec 
});

// Write files
for (const file of result.object.files) {
  await writeFile(file.path, file.content);
}
```

### In Workflows

```typescript
const workflow = createWorkflow({
  execute: async ({ inputData, mastra }) => {
    const builder = mastra.getAgent('agent-builder');
    const agent = await builder.generate(inputData.requirements);
    return { agent };
  }
});
```

## CLI

### Interactive Mode

```bash
$ mastra agent-builder

? What kind of agent would you like to build?
> Customer support agent

? What capabilities does it need?
> Search documentation and create tickets

Generating agent...
✓ Created: agents/customerSupport.ts
✓ Created: tools/searchDocs.ts
✓ Created: tools/createTicket.ts
```

### Non-Interactive

```bash
# Direct generation
mastra agent-builder "monitoring agent with Slack alerts"

# From file
mastra agent-builder --from requirements.md

# With output path
mastra agent-builder "data agent" --output ./agents/
```

### Piping

```bash
# Chain with other tools
echo "invoice processor" | mastra agent-builder | mastra test

# Batch processing
cat requirements.txt | xargs -I {} mastra agent-builder "{}"
```

## Playground

Visual interface with:
- Chat panel for requirements
- Live code preview
- Test runner
- Export to project

### Quick Actions
- "Add memory to this agent"
- "Connect to MCP server"
- "Add error handling"

## Advanced Patterns

### Template Usage

```typescript
await agentBuilder.generate(
  "Use the customer-support template with Zendesk",
  { 
    runtimeContext: { 
      template: 'customer-support',
      integrations: ['zendesk'] 
    }
  }
);
```

### Iterative Building

```typescript
// Start simple
const v1 = await agentBuilder.generate("chat agent");

// Enhance
const v2 = await agentBuilder.generate(
  "Add memory to the agent you just created"
);

// Fix issues
const v3 = await agentBuilder.generate(
  "The tests are failing, can you fix the imports?"
);
```

### Multi-Agent Systems

```typescript
await agentBuilder.generate(`
  Create a data pipeline with:
  - Ingestion agent for CSV/JSON
  - Processing agent with transformations  
  - Reporting agent with charts
  Make them communicate via workflows
`);
```