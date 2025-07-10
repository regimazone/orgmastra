# Architecture

How the Mastra Agent Builder works internally and why each component exists.

## Core Concept

The Agent Builder is a specialized Mastra Agent wrapped in a class that provides configuration flexibility.

```typescript
export class AgentBuilder extends Agent {
  private agent: Agent;

  constructor(config: AgentBuilderConfig) {
    this.agent = new Agent({
      name: 'agent-builder',
      description: 'An agent that builds other Mastra agents',
      instructions: defaultInstructions,
      tools: defaultTools,
      ...config,
    });

    return this.agent;
  }
}
```

## Custom Tools

Agent creation involves precise requirements - exact import paths, correctly shaped configuration objects, proper initialization order. Beyond getting the syntax right, developers need to discover which patterns work for their use case and ensure all the pieces integrate correctly. When modifying existing code, simple find/replace often breaks due to formatting differences, comments, or varying code styles. The tools split these concerns: generation tools handle boilerplate and structure, intelligence tools ensure correctness and find patterns, the AST tool reliably modifies code regardless of formatting, and dependency management keeps packages in sync.

The Agent Builder uses four custom tools: getCode (generates code templates), manageProject (handles project setup and dependencies), rewriteCode (AST-based code modifications), and patternLibrary (searches similar implementations). It also has access to the [MCP docs server](https://mastra.ai/en/docs/getting-started/mcp-docs-server) and uses validateCode internally.

See [TOOLS.md](./TOOLS.md) for detailed specifications of each tool.

### Generation Pipeline

```
1. User Input: "I need a support agent"
                    ↓
2. patternLibrary: Searches for similar agents
   → "Found 3 support agents with escalation"
                    ↓
3. getCode: Generates agent code
   → Complete agent with tools and configuration
                    ↓
4. Internal validation ensures everything works
   → Compiles ✓, Tests pass ✓, Types correct ✓
                    ↓
5. Output: Working agent with documentation
```

### Modification Pipeline

```
1. User Input: "Add memory to the agent"
                    ↓
2. rewriteCode: Analyzes current code
   → Finds agent definition via AST
                    ↓
3. getCode: Gets memory setup code
   → Correct imports and configuration
                    ↓
4. rewriteCode: Applies changes
   → Adds imports, creates memory instance, updates agent
                    ↓
5. Internal validation verifies modifications
   → No breaking changes ✓
```

## Memory System

The Agent Builder includes a customized `new Memory()` instance by default with thread-based conversation memory, semantic retrieval, and pattern learning enabled. Storage and vector providers are configurable by the user.

## Integration Architecture

Since it's a regular agent, we'll be able to build UIs for it in playground + Cloud in the standard way.
