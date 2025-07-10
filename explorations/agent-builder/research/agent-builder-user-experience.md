# Mastra Agent Builder: User Experience Design

## Overview

This document outlines the user experience for the Mastra Agent Builder across different interfaces, from programmatic usage to visual builders.

## Core Principles

1. **Progressive Disclosure**: Start simple, reveal complexity as needed
2. **Fail Fast with Help**: When something goes wrong, provide clear next steps
3. **Learn by Doing**: Generate working code immediately, explain later
4. **Framework Guidance**: Suggest Mastra best practices proactively

## The Agent Builder Agent

The Mastra Agent Builder is itself a Mastra Agent, which means it can be used anywhere a regular agent can be used.

### Agent Definition

```typescript
import { Agent } from '@mastra/core';
import { openai } from '@ai-sdk/openai';
import { 
  configSnippetBuilder,
  projectScaffolder,
  codeWriter,
  patternMatcher,
  validator,
  mastraCodeTransform 
} from './tools';

export const agentBuilder = new Agent({
  name: 'agent-builder',
  description: 'An expert at creating other Mastra agents',
  instructions: `You are an expert at building Mastra agents. You help users by:
    1. Understanding their requirements through conversation
    2. Suggesting appropriate architectures and patterns
    3. Generating working, tested code
    4. Iterating based on feedback
    
    Always generate tests alongside agent code. Use AST transforms for 
    modifications rather than find/replace. Suggest best practices proactively.`,
  model: openai('gpt-4o'),
  tools: {
    configSnippetBuilder,
    projectScaffolder,
    codeWriter,
    patternMatcher,
    validator,
    mastraCodeTransform
  },
  memory: true, // Enable conversation memory
});
```

## Programmatic Usage

### Basic Usage

```typescript
import { agentBuilder } from '@mastra/agent-builder';

// Use it like any Mastra agent
const response = await agentBuilder.generate(
  "I need an agent that can analyze customer feedback and create summary reports"
);

console.log(response.text); // Explanation and next steps
// "I'll help you create a customer feedback analysis agent. Let me understand your requirements better..."

// Continue the conversation
const codeResponse = await agentBuilder.generate(
  "Yes, it should handle CSV files and integrate with our Slack"
);
// Returns generated code, setup instructions, etc.
```

### Structured Output

```typescript
import { z } from 'zod';

const agentSpecSchema = z.object({
  code: z.string(),
  dependencies: z.array(z.string()),
  configuration: z.object({
    name: z.string(),
    features: z.array(z.string()),
    integrations: z.array(z.string()),
  }),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
  instructions: z.string(),
});

// Get structured output
const result = await agentBuilder.generate(
  "Create a data analysis agent with memory and RAG capabilities",
  { output: agentSpecSchema }
);

// Use the generated specification
for (const file of result.object.files) {
  await writeFile(file.path, file.content);
}
```

### In Workflows

```typescript
import { createWorkflow } from '@mastra/core';
import { agentBuilder } from '@mastra/agent-builder';

const agentCreationWorkflow = createWorkflow({
  id: 'create-agent-suite',
  description: 'Creates a suite of agents for a project',
  execute: async ({ inputData, mastra }) => {
    // Use agent builder in workflow
    const builder = mastra.getAgent('agent-builder');
    
    // Generate multiple agents
    const agents = [];
    for (const requirement of inputData.requirements) {
      const result = await builder.generate(requirement);
      agents.push(result);
    }
    
    return { agents };
  }
});
```

## CLI Experience

### Interactive Mode

```bash
$ mastra agent-builder

🤖 Mastra Agent Builder

Hello! I'm here to help you create Mastra agents. What kind of agent would you like to build?

> I need a customer support agent

I'll help you create a customer support agent. Let me ask a few questions to understand your needs better:

1. What channels will it support? (email/chat/both)
> both

2. Should it have access to a knowledge base?
> yes, we have documentation in markdown files

3. What escalation capabilities do you need?
> it should create tickets in Linear when it can't resolve issues

Great! I'll create a customer support agent that:
✓ Handles email and chat channels
✓ Searches markdown documentation
✓ Escalates to Linear

Here's what I'll generate:
- agents/customerSupport.ts (main agent)
- tools/searchDocs.ts (documentation search)
- tools/createLinearTicket.ts (escalation)
- tests/customerSupport.test.ts

Shall I proceed? (Y/n) > Y

✨ Generating your agent...
[Shows progress and generated files]
```

### Non-Interactive Mode

```bash
# Direct command
$ mastra agent-builder "Create a GitHub issue monitoring agent"

# From file
$ mastra agent-builder --from requirements.md

# With specific output
$ mastra agent-builder "Data analyst agent" --output ./agents/analyst.ts
```

### Piping and Automation

```bash
# Use in scripts
echo "Create an agent for processing invoices" | mastra agent-builder --json

# Chain with other tools
mastra agent-builder "monitoring agent" | mastra test

# Batch processing
cat agent-requirements.txt | xargs -I {} mastra agent-builder "{}"
```

## Playground Integration

In the Mastra Playground, the Agent Builder appears as a special agent that can be used interactively.

### Visual Interface

```typescript
// Playground recognizes agent-builder and provides special UI
interface AgentBuilderUI {
  // Chat interface for requirements gathering
  chat: {
    messages: Message[];
    send: (message: string) => void;
  };
  
  // Live preview of generated code
  preview: {
    files: GeneratedFile[];
    highlight: 'added' | 'modified' | 'removed';
  };
  
  // Test panel
  test: {
    runTests: () => void;
    results: TestResult[];
  };
  
  // Actions
  actions: {
    generate: () => void;
    regenerate: () => void;
    modify: (instruction: string) => void;
    export: () => void;
  };
}
```

### Playground Features

1. **Conversational Building**
   - Natural chat interface
   - Context-aware suggestions
   - Real-time code generation

2. **Code Preview**
   - Syntax highlighted
   - Diff view for modifications
   - File tree navigation

3. **Integrated Testing**
   - Run generated tests
   - See coverage reports
   - Debug failures

4. **Quick Actions**
   - "Add memory to this agent"
   - "Make it use GPT-4"
   - "Add error handling"

## Advanced Usage Patterns

### Template-Based Generation

```typescript
// Agent builder can use templates
const response = await agentBuilder.generate(
  "Create an agent using the customer-support template with Zendesk integration",
  {
    runtimeContext: {
      template: 'customer-support',
      integrations: ['zendesk'],
    }
  }
);
```

### Iterative Refinement

```typescript
// First pass
const v1 = await agentBuilder.generate("Basic chat agent");

// Enhance it
const v2 = await agentBuilder.generate(
  "Add memory and tools for web search to the agent you just created"
);

// Fix issues
const v3 = await agentBuilder.generate(
  "The tests are failing because of missing imports, can you fix it?"
);
```

### Batch Agent Creation

```typescript
const requirements = [
  "Data ingestion agent",
  "Analysis agent", 
  "Reporting agent"
];

// Generate a coordinated system
const system = await agentBuilder.generate(
  `Create a data pipeline system with these agents: ${requirements.join(', ')}. 
   Make sure they can work together through workflows.`
);
```

## Error Handling and Recovery

### Smart Error Messages

```typescript
// When generation fails
try {
  await agentBuilder.generate("Make an agent that does everything");
} catch (error) {
  console.log(error.message);
  // "That request is too broad. Let's break it down:
  //  - What specific tasks should the agent handle?
  //  - What tools or integrations does it need?
  //  Try: 'Create an agent that monitors emails and creates tasks'"
}
```

### Validation Feedback

```typescript
const result = await agentBuilder.generate("Customer service agent");

if (result.validation?.warnings) {
  console.log("Suggestions for improvement:");
  // - "Consider adding memory for conversation history"
  // - "Add rate limiting for API calls"
  // - "Include error handling for network failures"
}
```

## Integration Points

### With Existing Agents

```typescript
// Enhance existing agents
const enhanced = await agentBuilder.generate(
  "Add RAG capabilities to my existingAgent",
  {
    runtimeContext: {
      existingAgent: existingAgentConfig
    }
  }
);
```

### With Mastra CLI

```bash
# Agent builder is integrated into main CLI
$ mastra create agent --interactive
# This launches agent-builder in interactive mode

$ mastra enhance agents/myAgent.ts --add memory
# Uses agent-builder to modify existing code
```

### With VS Code Extension

```typescript
// Right-click on agent file -> "Enhance with Agent Builder"
// Opens inline chat with agent-builder
```

## Best Practices for Users

1. **Be Specific**: "Customer support agent" → "Customer support agent that searches docs and escalates to Linear"

2. **Iterate**: Start simple, add features incrementally

3. **Test Often**: Use generated tests to validate behavior

4. **Learn Patterns**: Agent builder teaches Mastra patterns through generated code

5. **Save Templates**: Export successful agents as templates for future use