# Mastra Agent Builder

An agent that creates other Mastra agents through conversation.

## What

The Agent Builder is a Mastra Agent with specialized tools for generating agent code. It understands requirements through natural language and produces working TypeScript code.

```typescript
import { agentBuilder } from '@mastra/agent-builder';

const response = await agentBuilder.generate(
  "Create a customer support agent that searches docs and escalates to Linear"
);
// Returns: Complete agent code with tools, tests, and setup instructions
```

## Why

### Problems Solved
- **Boilerplate**: No more copying agent setup code
- **Discovery**: Learn Mastra patterns through generated examples  
- **Validation**: Generated code compiles and includes tests
- **Integration**: Handles imports, types, and configuration

### Key Innovation
Instead of generic find/replace, uses AST transforms for reliable code modifications:
- Add tool to agent
- Update configuration  
- Add memory or workflows
- Modify without breaking

## Quick Start

```typescript
// 1. Install
npm install @mastra/agent-builder

// 2. Use as agent
const result = await agentBuilder.generate("I need a data analysis agent");

// 3. Or use structured output
const spec = await agentBuilder.generate(prompt, { 
  output: agentSpecSchema 
});
```

## Documentation

- [Architecture](./ARCHITECTURE.md) - How it works internally
- [Interfaces](./INTERFACES.md) - All ways to use the builder
- [Tools](./TOOLS.md) - Technical tool specifications
- [Roadmap](./ROADMAP.md) - Shipping phases and capabilities
- [Patterns](./PATTERNS.md) - Research insights and decisions