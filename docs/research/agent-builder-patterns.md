# Agent Builder Patterns Research

## Executive Summary

This document analyzes successful coding agent architectures and patterns from leading platforms including v0 by Vercel, Lovable (formerly GPT Engineer), and Cursor AI. These insights will inform the design of Mastra's Agent Builder.

## Key Findings

### 1. v0 by Vercel - Composite Model Architecture

#### Architecture Highlights
- **Composite Model System**: Combines specialized models for different tasks
  - Base model (e.g., Anthropic Sonnet) for generation
  - Quick Edit model for small changes
  - AutoFix model for error correction
- **Streaming Post-Processing**: Validates output in real-time
- **Specialized for Frontend**: Optimized for React/Next.js components

#### Success Factors
- **Speed through Specialization**: Different models for different complexity levels
- **Error Prevention**: Continuous validation during generation
- **Framework Focus**: Deep knowledge of specific frameworks rather than general coding

#### Key Takeaway for Mastra
Implement specialized pipelines for different agent creation tasks (simple tools vs. complex workflows).

#### User Interaction Analysis
**What Users Love:**
- **Speed**: Near-instant UI component generation
- **Iteration**: Quick edits without regenerating everything
- **Quality**: Clean, production-ready React code
- **Shadcn/UI Integration**: Seamless use of popular component library

**Common User Complaints:**
- **Limited to Frontend**: No backend logic generation
- **Framework Lock-in**: Primarily React/Next.js focused
- **Subscription Cost**: $20/month for API access
- **Style Constraints**: Sometimes too opinionated on design

**Persistent Problems:**
- Users report occasional hydration errors in generated Next.js components
- Complex state management often requires manual intervention
- Limited understanding of project-specific context

### 2. Lovable AI - Documentation-Driven Development

#### Architecture Highlights
- **Full-Stack Generation**: Creates complete applications with frontend and backend
- **Supabase Integration**: Built-in backend capabilities
- **Documentation as Infrastructure**: Uses documentation to guide future generations

#### Success Factors
- **Contextual Continuity**: Documentation creates "thought infrastructure"
- **Clean, Editable Code**: Generates maintainable code
- **Natural Language Interface**: Pure chat-based interaction

#### Key Takeaway for Mastra
Build a documentation system that captures agent design decisions and patterns for future reference.

#### User Interaction Analysis
**What Users Love:**
- **Full-Stack Capability**: Generates complete working applications
- **Supabase Integration**: Backend just works out of the box
- **Clean Code**: Highly readable and maintainable output
- **Project Persistence**: Can return to projects and continue building

**Common User Complaints:**
- **Slow Generation**: Can take minutes for complex apps
- **Limited Tech Stack**: Locked into React + Supabase
- **Database Complexity**: Struggles with complex schemas
- **Cost**: Usage-based pricing can add up quickly

**Persistent Problems:**
- Authentication flows often need manual refinement
- Complex business logic requires multiple iterations
- Limited ability to integrate with existing codebases
- Occasional loss of context in long conversations

### 3. Cursor AI - Background Agents

#### Architecture Highlights
- **Multi-Tier Model System**:
  - Inline predictions: cursor-small model
  - Cross-file processing: Claude 3.7 Sonnet
  - Background agents: GPT-4 Turbo
- **Cloud Execution**: AWS Firecracker for isolated execution
- **Anyrun Orchestrator**: Rust service for secure agent launching

#### Success Factors
- **Parallel Execution**: Multiple agents working concurrently
- **Multiple Access Points**: Slack, web app, IDE integration
- **Git Integration**: Agents work on separate branches

#### Key Takeaway for Mastra
Consider background agent capabilities for long-running agent generation tasks.

#### User Interaction Analysis
**What Users Love:**
- **Non-Blocking**: Can continue coding while agents work
- **Multi-Task**: Run multiple agents simultaneously
- **Branch Management**: Automatic Git branch creation
- **Cross-Platform Access**: Slack, web, and IDE integration

**Common User Complaints:**
- **Data Retention**: Requires storing code for days
- **Privacy Concerns**: Code processed in cloud
- **Complexity**: Hard to understand what agents are doing
- **Cost**: Background agents require premium subscription

**Persistent Problems:**
- Agents sometimes make conflicting changes
- Difficult to debug when agents fail
- Limited visibility into agent decision-making
- Merge conflicts when multiple agents work on same area

## Overall User Interaction Insights

### What Makes Users Successful
1. **Clear, Specific Prompts**: Users who provide detailed requirements get better results
2. **Iterative Refinement**: Best outcomes come from multiple rounds of feedback
3. **Understanding Limitations**: Users who work within platform constraints are happier
4. **Template Usage**: Starting from examples/templates leads to faster success

### Common Friction Points
1. **Context Loss**: All platforms struggle with maintaining context over long sessions
2. **Integration Challenges**: Connecting to existing codebases is universally difficult
3. **Debugging Generated Code**: Users often can't understand why generated code fails
4. **Cost Anxiety**: Usage-based pricing creates hesitation to experiment

### User Expectations vs Reality
- **Expectation**: "Build me a complete app like Uber"
- **Reality**: Better at specific, well-defined components
- **Expectation**: Perfect code on first try
- **Reality**: Requires iteration and manual refinement
- **Expectation**: Understands all frameworks equally
- **Reality**: Each platform has preferred tech stacks

## Testing and Validation Strategies

### How Each Platform Handles Testing

#### v0 by Vercel
- **Real-time Preview**: Instant visual validation in browser
- **No Automated Tests**: Relies on visual inspection
- **AutoFix Model**: Catches syntax errors during generation
- **User Feedback**: "This doesn't look right" → regenerate

#### Lovable AI
- **Build Verification**: Ensures code compiles
- **Basic Runtime Checks**: Verifies app starts without crashing
- **Database Validation**: Tests Supabase connections
- **Limited Test Generation**: Occasionally generates basic tests on request

#### Cursor Background Agents
- **Compilation Checks**: Verifies TypeScript/syntax validity
- **Existing Test Runner**: Can run project's existing tests
- **Test Generation**: Can write tests when explicitly asked
- **Git Integration**: Won't merge if tests fail

### Common Testing Gaps
1. **No Automatic Test Generation**: Tests rarely generated unless requested
2. **Limited Coverage**: Generated tests often superficial
3. **Integration Testing**: Rarely handles complex integration scenarios
4. **Edge Cases**: Doesn't proactively test error conditions

### User-Reported Testing Issues
- "The code looks right but doesn't work"
- "Generated tests pass but app still breaks"
- "Wish it would test the code before showing it to me"
- "Hard to know if generated code will work in production"

## Common Patterns Across Platforms

### 1. Multi-Stage Processing
All platforms use multiple stages:
- **Planning/Analysis** → **Generation** → **Validation** → **Refinement**

### 2. Specialized Models
Rather than one-size-fits-all:
- Different models for different complexity levels
- Specialized knowledge for specific frameworks/languages

### 3. Error Prevention Over Correction
- Continuous validation during generation
- Structured output formats
- Template-based generation for common patterns

### 4. User Experience Focus
- Natural language interfaces
- Progressive disclosure of complexity
- Quick iteration cycles

## Anti-Patterns to Avoid

### 1. Monolithic Generation
- Avoid trying to generate everything in one pass
- Break down into manageable, testable components

### 2. Unconstrained Creativity
- Pure LLM generation leads to inconsistent results
- Use templates and validated patterns

### 3. Ignoring Context
- Don't treat each generation as isolated
- Build on previous patterns and decisions

## Implications for Mastra Agent Builder

### 1. Adopt Composite Approach
- **Configuration Generator**: For agent setup and initialization
- **Tool Builder**: Specialized for tool creation with Zod schemas
- **Workflow Designer**: For complex multi-step processes
- **Integration Specialist**: For MCP and external services

### 2. Template-First Generation
- Build library of validated agent patterns
- Use templates as starting points
- Allow customization through parameters

### 3. Progressive Enhancement
- Start with simple agent generation
- Add complexity through iterations
- Learn from successful patterns

### 4. Documentation Integration
- Capture design decisions
- Build pattern library over time
- Use for future improvements

### 5. Testing-First Approach (Learning from Gaps)
- **Auto-generate tests**: Create tests alongside agent code
- **Validation Pipeline**: Run tests before showing code to user
- **Integration Testing**: Test agent with sample inputs/outputs
- **Edge Case Coverage**: Proactively test error conditions
- **Live Validation**: Test agents in sandboxed environment before deployment

## Recommended Architecture Elements

### 1. Core Components
```
Agent Builder
├── Requirements Analyzer
├── Pattern Matcher
├── Code Generators
│   ├── Agent Config Generator
│   ├── Tool Generator
│   ├── Workflow Generator
│   └── Integration Generator
├── Validator
└── Refinement Engine
```

### 2. Tool Ecosystem
- **Snippet Builder**: Returns validated code snippets
- **Pattern Library**: Stores successful agent patterns
- **Validation Suite**: Type checking and testing
- **Documentation Generator**: Creates usage guides

### 3. Workflow Design
```
User Input → Analyze Requirements → Match Patterns → Generate Plan
    ↓
Review ← Validate ← Generate Code ← Select Templates
    ↓
Deploy → Test → Document → Learn
```

## Next Steps

1. Design specific tool interfaces based on these patterns
2. Create template library for common agent types
3. Build validation pipeline for generated code
4. Implement learning system for pattern improvement

## References

- [v0 Composite Model Family announcement](https://vercel.com/blog/v0-composite-model-family)
- [Announcing v0: Generative UI](https://vercel.com/blog/announcing-v0-generative-ui)
- [Lovable: From GPT Engineer to Production Platform](https://lovable.dev/blog/2025-01-13-rebranding-gpt-engineer-to-lovable)
- [What 200+ Hours with Lovable.dev Taught Me](https://www.shepbryan.com/blog/lovable-ai-engineer)
- [Cursor 1.0 Background Agents](https://cursor.com/changelog)
- [Cursor Background Agents Architecture](https://docs.cursor.com/background-agent)
- [Real-world engineering challenges: building Cursor](https://newsletter.pragmaticengineer.com/p/cursor)
- [MetaGPT: Multi-Agent Framework](https://github.com/geekan/MetaGPT)
- [AutoGPT Documentation](https://docs.agpt.co/platform/create-basic-agent/)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)