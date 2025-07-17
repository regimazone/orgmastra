# Mastra Agent Builder

Creating Mastra agents involves repetitive steps: setting up imports, configuring the agent, adding tools, wiring up memory. This manual process is exactly what agents should automate. LLMs excel at code generation when given the right context and patterns. By creating an Agent Builder, Mastra uses its own capabilities to make itself more accessible - agents building agents represents the natural evolution of development tools.

## Overview

**API**
The Agent Builder will be a pre-made Mastra Agent with specialized tools for generating agent code. It will understand requirements through natural language and produce working Mastra agents, tools, and workflows (and any other Mastra feature).

**Memory**
It has pre-configured memory suited for working on codebases (no semantic recall - we can think about a repomap later, 20 lastMessages, token limiter built in but configurable, premade custom working memory template).
Storage and vector providers are passed in the constructor.

**Tools**
It includes four custom tools:

- `manageProject` for project setup and dependency management - scaffolding, package management, etc
- `rewriteCode` for AST-based code modifications. (not initially, just start with find/replace)
- `patternLibrary` for retrieving code patterns by name (focused, concise docs specifically for the agent)
  - eg `workflows`, `memory`, `memory.withLibsql`, `agent`, `agentNetwork`, `etc`
  - Each pattern will include a short code usage snippet, which packages must be installed, how to import, and a description of how to write a test (to start lets just use MCP docs server for first iteration)
- `implementationGuide` for retrieving short descriptions of how features work (ex: `agent`-> `[couple sentence description of how to create and use agents, when you would use them, why]`) (to start also skip this and use MCP docs server)

So first iteration tools are actually:

- `manageProject` - use swpm, it automatically uses whatever pm they're using (https://www.npmjs.com/package/swpm)
- MCP docs server for knowledge
  We can start with existing OSS MCP servers for these:
- `searchReplace` (check out https://github.com/TylerBarnes/mcp-editor but maybe there's a better one now)
- shell commands (probably @dillip285/mcp-terminal, but maybe worth trying others too)

**Docs**
It also has access to the Mastra MCP docs server to look up documentation.

Its system prompt will encourage it to write tests and evals, with a description on how/when to do that.

## Usage

```typescript
import { AgentBuilder } from '@mastra/agent-builder';
import { openai } from '@ai-sdk/openai';

const agentBuilder = new AgentBuilder({
  model: openai('o3'),
  storage: ...,
});

const response = await agentBuilder.generate(
  'Create a customer support agent that searches docs and escalates to Linear',
);
```

Users can extend the default configuration:

```typescript
const agentBuilder = new AgentBuilder({
  model: openai('o3'),
  tools: {
    ...AgentBuilder.defaultConfig.tools,
    // additional tools
  },
  instructions: AgentBuilder.defaultConfig.instructions + '\nAdditional custom instructions.',
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

- [Tools](./TOOLS.md) - Technical tool specifications

## Open Questions

- Do we need different system prompts per-model?
  - atleast short term we should focus on one high quality model we recommend (probably claude)

## Testing

- We should have a mini benchmark / test suite where we ask it to code up some feat, then call a server endpoint and expect in tests that it works.
- Come up with benchmark item list (workflows, agents, etc)

## Initial TODO

- Make the AgentBuilder class
- Give it a basic system prompt
- Basic tools
- Start writing the tests for cases it should be able to do
