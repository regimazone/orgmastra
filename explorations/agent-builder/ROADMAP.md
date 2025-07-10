# Roadmap

Incremental shipping plan for the Agent Builder.

## Phase 1: Experimental Package

**Goal**: Validate core concept

### Ships
- Basic agent with generation tools
- NPM package `@mastra/agent-builder`
- Simple examples

### Capabilities
- ✅ Create basic agents with conversation
- ✅ Generate custom tools with schemas
- ✅ Attach tools to agents
- ✅ Code compiles and tests pass

### Success Criteria
All capabilities working reliably.

## Phase 2: CLI Integration

**Goal**: Developer-friendly tooling

### Ships
- `mastra agent-builder` command
- Interactive and non-interactive modes
- Integration with main CLI

### New Capabilities
- ✅ Add memory to agents
- ✅ Search and configure MCP servers
- ✅ Create workflows
- ✅ Modify code using AST transforms

### Success Criteria
CLI provides better experience than programmatic API.

## Phase 3: Playground Integration

**Goal**: Visual building for all users

### Ships
- Agent Builder in playground
- Visual conversation interface
- Real-time preview
- Export functionality

### New Capabilities
- ✅ Multi-agent systems
- ✅ Agent communication setup
- ✅ Visual workflow builder
- ✅ Domain-specific templates

### Success Criteria
Non-developers can create working agents.

## Phase 4: Deployment & Cloud

**Goal**: Deploy generated agents

### Ships
- Deployment configurations
- Cloud marketplace
- Team features

### New Capabilities
- ✅ Error handling and retries
- ✅ Authentication setup
- ✅ Deploy to platforms
- ✅ Monitoring integration

### Success Criteria
Generated agents run in production.

## Decision Points

### Phase 1 → 2
- Core generation working
- AST transforms implemented
- Architecture validated

### Phase 2 → 3  
- MCP integration smooth
- Workflow generation reliable
- Good developer feedback

### Phase 3 → 4
- Multi-agent generation stable
- Visual builder effective
- Deployment needs clear

## Future Considerations

- Self-improving based on usage
- Integration with IDEs
- Community template system
- Cross-language support