# Mastra Agent Builder - Expanded RFC

## Executive Summary

The Mastra Agent Builder represents a paradigm shift in how developers create AI agents. By leveraging Mastra's own capabilities to build Mastra agents, we're demonstrating the framework's power while dramatically reducing the barrier to entry for agent development. This RFC outlines a comprehensive approach to building an agent that builds agents - a meta-tool that transforms natural language requirements into production-ready Mastra code.

## Problem Statement

Creating Mastra agents currently involves:
- Understanding framework patterns and best practices
- Writing boilerplate code for imports, configuration, and setup
- Manually wiring up tools, memory, and workflows
- Debugging configuration issues
- Testing agent behavior

This manual process is exactly what agents should automate. LLMs excel at code generation when given the right context and patterns. The Agent Builder solves this by providing an intelligent assistant that understands Mastra's architecture and generates correct, tested code.

## Solution Overview

The Agent Builder is a pre-configured Mastra Agent with specialized tools for generating agent code. It's not a separate system - it's built using Mastra itself, proving our framework's flexibility.

### Core Components

1. **Specialized Agent Configuration**
   - Model: Configurable (default: high-capability models like GPT-4 or Claude)
   - Memory: 20 lastMessages, no semantic recall, custom working memory template
   - Instructions: Domain-specific prompt for code generation

2. **Custom Tools Suite**
   - `patternLibrary`: Retrieves Mastra patterns with examples
   - `implementationGuide`: Provides feature explanations
   - `manageProject`: Handles project setup and dependencies
   - `rewriteCode`: AST-based code modifications
   - MCP docs server access for real-time documentation

3. **Validation Pipeline**
   - TypeScript compilation checks
   - Schema validation
   - Import resolution
   - Test generation and execution

## Technical Architecture

### Agent Configuration

```typescript
const agentBuilder = new AgentBuilder({
  model: openai('gpt-4'),
  memory: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      template: `Track the current project structure, dependencies installed, 
                 agents created, tools added, and any configuration changes made.`
    }
  },
  tools: [
    patternLibrary,
    implementationGuide,
    manageProject,
    rewriteCode,
    // MCP docs server automatically included
  ],
  instructions: `You are an expert Mastra developer. Generate clean, tested code 
                 following Mastra patterns. Always validate generated code.`
});
```

### Generation Pipeline

```
User Request → Parse Requirements → Select Patterns → Adapt Code → Validate → Output
```

1. **Parse Requirements**: Extract agent purpose, needed tools, integration points
2. **Select Patterns**: Match requirements to available patterns
3. **Adapt Code**: Generate specific implementation
4. **Validate**: Ensure code compiles and tests pass
5. **Output**: Return working code with setup instructions

### Tool Specifications

#### Pattern Library Tool

Provides access to common Mastra patterns:

```typescript
const patterns = {
  'agent': {
    code: `import { Agent } from '@mastra/core';
           const agent = new Agent({ ... });`,
    imports: ['@mastra/core'],
    dependencies: { '@mastra/core': '^latest' },
    testingGuide: 'Use beforeEach to reset agent state...'
  },
  'memory.withPostgres': { ... },
  'workflows': { ... },
  'tools.custom': { ... },
  'mcp.server': { ... }
};
```

#### Implementation Guide Tool

Returns concise explanations:

```typescript
const guides = {
  'agent': `Agents are the primary interaction abstraction in Mastra. 
            They combine an LLM with tools, memory, and optional voice capabilities. 
            Use agents when you need conversational AI with stateful interactions.`,
  'memory': `Memory provides conversation persistence and context retrieval.
             Three types: lastMessages (recent context), semanticRecall (RAG), 
             and workingMemory (structured state).`
};
```

#### Manage Project Tool

Handles project lifecycle:

```typescript
interface ProjectActions {
  create: (name: string, type: 'standalone' | 'api' | 'nextjs') => void;
  addDependency: (pkg: string, version?: string) => void;
  updatePackageJson: (updates: object) => void;
  createFile: (path: string, content: string) => void;
  runCommand: (cmd: string) => string;
}
```

#### Rewrite Code Tool

AST-based modifications:

```typescript
const transforms = {
  'add-tool-to-agent': (agentName: string, toolName: string) => AST,
  'update-agent-config': (agentName: string, config: object) => AST,
  'add-memory-to-agent': (agentName: string, memoryConfig: object) => AST,
  'create-custom-tool': (toolDef: ToolDefinition) => AST
};
```

## Usage Patterns

### Basic Generation

```typescript
const response = await agentBuilder.generate(
  'Create a customer support agent that searches docs and escalates to Linear'
);
```

### Advanced Configuration

```typescript
const response = await agentBuilder.generate({
  prompt: 'Create a code review agent',
  requirements: {
    tools: ['github', 'custom-linter'],
    memory: 'postgres',
    deployment: 'vercel-function'
  },
  context: {
    existingProject: true,
    projectPath: './src/agents'
  }
});
```

### Workflow Integration

```typescript
const generateAgentStep = step('generate-agent')
  .using(agentBuilder)
  .input(z.object({ requirements: z.string() }))
  .execute(async ({ input }) => {
    return await agentBuilder.generate(input.requirements);
  });
```

## Implementation Roadmap

### Phase 1: Core Functionality (2 weeks)
- [x] Basic agent generation
- [x] Tool creation support
- [ ] Pattern library implementation
- [ ] Code validation pipeline
- [ ] NPM package release

### Phase 2: Enhanced Features (3 weeks)
- [ ] CLI integration
- [ ] Memory configuration support
- [ ] Workflow generation
- [ ] AST-based modifications
- [ ] Project management tools

### Phase 3: Visual Tools (4 weeks)
- [ ] Playground integration
- [ ] Live preview capability
- [ ] Multi-agent system support
- [ ] Template marketplace
- [ ] Test runner integration

### Phase 4: Production Features (4 weeks)
- [ ] Deployment automation
- [ ] Error handling patterns
- [ ] Authentication setup
- [ ] Monitoring integration
- [ ] Performance optimization

## Success Metrics

1. **Developer Productivity**
   - Time to create first agent: < 5 minutes
   - Code generation accuracy: > 90%
   - Compilation success rate: > 95%

2. **Adoption Metrics**
   - Weekly active developers
   - Agents created per week
   - Community template contributions

3. **Quality Metrics**
   - Generated code test coverage
   - Runtime error rates
   - User satisfaction scores

## Risk Mitigation

1. **Code Quality Risk**
   - Mitigation: Comprehensive validation pipeline
   - Fallback: Human review for complex cases

2. **Performance Risk**
   - Mitigation: Caching patterns and generations
   - Fallback: Async generation with progress updates

3. **Complexity Risk**
   - Mitigation: Progressive disclosure of features
   - Fallback: Simplified mode for beginners

## Future Vision

### Self-Improvement
The Agent Builder could analyze successful patterns and improve its own generation capabilities.

### IDE Integration
Direct integration with VS Code, Cursor, and other IDEs for inline agent generation.

### Cross-Language Support
Extend beyond TypeScript to Python, Go, and other languages.

### Community Ecosystem
- Public template marketplace
- Agent sharing and discovery
- Collaborative agent development

## Technical Decisions

### Why Build as an Agent?
1. **Dogfooding**: Proves Mastra's capabilities
2. **Flexibility**: Inherits all agent features (memory, tools, deployment)
3. **Consistency**: Uses same patterns it generates

### Why AST Transforms?
1. **Reliability**: More robust than string manipulation
2. **Preservation**: Maintains existing code structure
3. **Validation**: Can ensure syntactic correctness

### Why Separate Tools?
1. **Modularity**: Each tool has single responsibility
2. **Testability**: Tools can be tested independently
3. **Extensibility**: Easy to add new capabilities

## API Examples

### Creating Custom Templates

```typescript
agentBuilder.addTemplate('financial-advisor', {
  description: 'Agent for financial analysis and advice',
  requiredTools: ['market-data', 'portfolio-analyzer'],
  memoryConfig: { 
    semanticRecall: { topK: 10 },
    workingMemory: { 
      template: 'Track portfolio positions, risk tolerance...' 
    }
  },
  systemPrompt: 'You are a professional financial advisor...'
});
```

### Batch Generation

```typescript
const agents = await agentBuilder.generateBatch([
  { name: 'support', requirements: '...' },
  { name: 'sales', requirements: '...' },
  { name: 'analytics', requirements: '...' }
]);
```

### Interactive Mode

```typescript
const session = agentBuilder.interactive();
await session.start();
// Q: What kind of agent would you like to create?
// A: A code review agent for TypeScript projects
// Q: Which tools should it have access to?
// ...
```

## Conclusion

The Mastra Agent Builder transforms agent development from a manual coding process to an intelligent, conversation-driven experience. By building it as a Mastra agent itself, we demonstrate the framework's power while making it accessible to developers of all skill levels.

This tool will accelerate Mastra adoption, improve code quality, and enable new use cases we haven't yet imagined. It's not just a code generator - it's a gateway to the future of AI agent development.

## Next Steps

1. Finalize tool implementations
2. Build initial prototype
3. Test with internal team
4. Release experimental package
5. Gather feedback and iterate

## Appendices

### A. Pattern Library Examples
[Detailed pattern specifications]

### B. AST Transform Specifications
[Transform implementation details]

### C. Validation Pipeline Details
[Step-by-step validation process]

### D. Performance Benchmarks
[Expected generation times and resource usage]