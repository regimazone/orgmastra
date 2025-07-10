# Agent Builder TODO

## Research & Planning ✅
- [x] Research successful agent builders (v0, Lovable, Cursor)
- [x] Research framework-specific code generation advantages
- [x] Design AST-based code editing approach
- [x] Create technical architecture document
- [x] Design user experience across interfaces
- [x] Create incremental shipping strategy
- [x] Write comprehensive RFC

## Phase 1: Experimental Package

### Core Agent Development
- [ ] Create basic Agent definition with tools
- [ ] Implement configSnippetBuilder tool
- [ ] Implement projectScaffolder tool
- [ ] Implement codeWriter tool
- [ ] Implement patternMatcher tool
- [ ] Implement validator tool
- [ ] Implement mastraCodeTransform tool (AST-based)

### Tool Implementations
- [ ] Design Zod schemas for each tool
- [ ] Create tool execution logic
- [ ] Add error handling and validation
- [ ] Write unit tests for tools

### Template System
- [ ] Create basic agent templates
- [ ] Design template structure
- [ ] Implement template matching logic
- [ ] Create domain-specific templates

### Testing & Validation
- [ ] Set up test harness for generated code
- [ ] Create validation pipeline
- [ ] Test TypeScript compilation
- [ ] Test generated agent execution

### Documentation
- [ ] Write getting started guide
- [ ] Create API documentation
- [ ] Add examples for common use cases
- [ ] Document limitations and known issues

## Phase 2: CLI Integration

### CLI Commands
- [ ] Implement `mastra agent-builder` command
- [ ] Add interactive mode with prompts
- [ ] Add non-interactive mode with flags
- [ ] Integrate with main Mastra CLI

### Enhanced Features
- [ ] MCP server search and integration
- [ ] Memory system configuration
- [ ] Workflow generation
- [ ] AST transform improvements

## Phase 3: Playground Integration

### Visual Builder
- [ ] Design UI for agent builder chat
- [ ] Implement code preview panel
- [ ] Add real-time testing
- [ ] Create export functionality

### Multi-Agent Features
- [ ] Agent network visualization
- [ ] Communication setup
- [ ] Workflow builder integration

## Phase 4: Cloud & Deployment

### Deployment Features
- [ ] Error handling patterns
- [ ] Authentication setup
- [ ] Rate limiting configuration
- [ ] Deployment config generation

### Template Marketplace
- [ ] Template submission system
- [ ] Version control integration
- [ ] Community voting/rating

## Technical Debt & Improvements

### AST Transform System
- [ ] Research ast-grep integration
- [ ] Build Mastra-specific transforms
- [ ] Create transform test suite
- [ ] Performance optimization

### Learning System
- [ ] Track successful patterns
- [ ] Pattern extraction from usage
- [ ] Feedback loop implementation

## Open Questions

1. Should we use ast-grep directly or build wrapper?
2. How to handle template versioning?
3. What's the best way to test generated agents?
4. How to handle breaking changes in Mastra core?
5. Should agent builder update itself?

## Next Immediate Steps

1. Set up package structure in `explorations/agent-builder/`
2. Create basic Agent with minimal tools
3. Implement configSnippetBuilder as proof of concept
4. Test with simple agent generation
5. Gather feedback and iterate