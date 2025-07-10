# Mastra Agent Builder

Creating Mastra agents involves repetitive steps: setting up imports, configuring the agent, adding tools, wiring up memory. This manual process is exactly what agents should automate. LLMs excel at code generation when given the right context and patterns. By creating an Agent Builder, Mastra uses its own capabilities to make itself more accessible - agents building agents represents the natural evolution of development tools.

## What it is

The Agent Builder will be a Mastra Agent with specialized tools for generating agent code. It will understand requirements through natural language and produce working Mastra agents, tools, and workflows.

## How it works

```typescript
import { AgentBuilder } from '@mastra/agent-builder';
import { openai } from '@ai-sdk/openai';

const agentBuilder = new AgentBuilder({
  model: openai('o3'),
});

const response = await agentBuilder.generate(
  'Create a customer support agent that searches docs and escalates to Linear',
);
// Will return: Complete agent code with tools, tests, and setup instructions
```

You can also extend the default configuration:

```typescript
import { defaultAgentBuilderConfig } from '@mastra/agent-builder';

const agentBuilder = new AgentBuilder({
  model: openai('o3'),
  tools: {
    ...defaultAgentBuilderConfig.tools,
    // additional tools
  },
  instructions: defaultAgentBuilderConfig.instructions + '\nAdditional custom instructions.',
});
```

## Where you can use it

The Agent Builder will be a standard Mastra Agent, which means it can be:

- Used programmatically in your code (as shown above)
- Added to your Mastra configuration alongside other agents
- Called from workflows for automated agent generation
- Added to MCP servers

It will also be:

- Accessed via the Mastra CLI for interactive agent creation
- Used through the Playground and Mastra Cloud UIs

Since it's just an agent, it inherits all Mastra capabilities: memory for conversation context, tool execution for code generation, and integration with the broader Mastra ecosystem.

## Planning

- [Architecture](./ARCHITECTURE.md) - How it will work internally
- [Interfaces](./INTERFACES.md) - All planned usage methods
- [Tools](./TOOLS.md) - Technical tool specifications
- [Roadmap](./ROADMAP.md) - Shipping phases and capabilities
- [Patterns](./PATTERNS.md) - Research insights and design decisions

