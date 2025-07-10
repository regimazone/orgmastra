# Architecture

How the Mastra Agent Builder works internally.

## Core Concept

The Agent Builder is itself a Mastra Agent, configured with specialized tools for code generation.

```typescript
export const agentBuilder = new Agent({
  name: 'agent-builder',
  description: 'Creates other Mastra agents',
  instructions: 'You are an expert at building Mastra agents...',
  model: openai('gpt-4o'),
  tools: {
    configSnippetBuilder,
    projectScaffolder,
    codeWriter,
    patternMatcher,
    validator,
    mastraCodeTransform
  },
  memory: true
});
```

## Tool System

### Generation Tools

**configSnippetBuilder**: Generates validated configuration snippets
- Input: Features needed (memory, MCP, tools)
- Output: Correct imports and setup code

**projectScaffolder**: Creates project structure
- Input: Project type and features
- Output: Complete directory with dependencies

**codeWriter**: Writes specific components
- Input: Component type and requirements
- Output: TypeScript files

### Intelligence Tools

**patternMatcher**: Finds similar patterns
- Input: Requirements
- Output: Matching templates and examples

**validator**: Ensures correctness
- Input: Generated code
- Output: Compilation results and warnings

### AST Transform Tool

**mastraCodeTransform**: Modifies existing code
- Uses ast-grep for pattern matching
- Mastra-specific transformations
- No find/replace failures

```typescript
// Instead of error-prone string matching:
await mastraCodeTransform.execute({
  file: 'agent.ts',
  transform: 'add-tool-to-agent',
  params: { agentName: 'support', toolName: 'search' }
});
```

## Generation Flow

```
User Input
    ↓
Requirements Analysis (via conversation)
    ↓
Pattern Matching (find similar examples)
    ↓
Code Generation (using templates + LLM)
    ↓
Validation (TypeScript + tests)
    ↓
Output (files + instructions)
```

## Memory System

- Conversation context for iterative building
- Pattern library from successful generations
- Semantic search for similar requirements

## Integration Points

- **MCP**: Access to Mastra docs and examples
- **Workflows**: Can be used in automated pipelines
- **Playground**: Special UI for visual building