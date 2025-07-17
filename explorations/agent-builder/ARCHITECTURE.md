# Architecture

How the Mastra Agent Builder works internally and why each component exists.

## Core Concept

The Agent Builder is a pre-made Mastra Agent with specialized configuration for code generation tasks.

```typescript
export const agentBuilderConfig = {
  name: 'agent-builder',
  description: 'An agent that builds other Mastra agents',
  instructions: defaultInstructions, // includes test/eval guidance
  tools: defaultTools,
  memory: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemoryTemplate: customCodebaseTemplate,
  },
};

export class AgentBuilder {
  static defaultConfig = agentBuilderConfig;
  
  constructor(config: AgentBuilderConfig) {
    return new Agent({
      ...agentBuilderConfig,
      ...config,
    });
  }
}
```

## Custom Tools

Agent creation involves precise requirements - exact import paths, correctly shaped configuration objects, proper initialization order. Beyond getting the syntax right, developers need to discover which patterns work for their use case and ensure all the pieces integrate correctly. When modifying existing code, simple find/replace often breaks due to formatting differences, comments, or varying code styles. The tools split these concerns: generation tools handle boilerplate and structure, intelligence tools ensure correctness and find patterns, the AST tool reliably modifies code regardless of formatting, and dependency management keeps packages in sync.

The Agent Builder uses four custom tools: patternLibrary (provides code patterns by name), implementationGuide (explains how features work), manageProject (handles project setup and dependencies), and rewriteCode (AST-based code modifications). It also has access to the [MCP docs server](https://mastra.ai/en/docs/getting-started/mcp-docs-server).

See [TOOLS.md](./TOOLS.md) for detailed specifications of each tool.

### Generation Pipeline

```
1. User Input: "I need a support agent"
                    ↓
2. patternLibrary: Lists patterns, selects "agent.withTools"
   → Returns support agent pattern with tool integration
                    ↓
3. Agent adapts pattern to user's needs
   → Customizes instructions, adds specific tools
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
2. patternLibrary: Gets "memory.withThreads" pattern
   → Returns memory setup code and imports
                    ↓
3. rewriteCode: Applies changes to existing agent
   → Adds imports, creates memory instance, updates config
                    ↓
4. Internal validation verifies modifications
   → No breaking changes ✓
```

## Memory System

The Agent Builder has pre-configured memory optimized for working on codebases:
- **Last Messages**: 20 (to maintain context across multiple file operations)
- **Semantic Recall**: Disabled (not needed for code generation tasks)
- **Working Memory Template**: Custom template designed for tracking code changes and project state
- **Storage Provider**: Passed in constructor by user

## Integration Architecture

Since it's a regular agent, we'll be able to build UIs for it in playground + Cloud in the standard way.
