# Patterns

Key insights from research and design decisions.

## Learning from Others

### v0 (Vercel)
- **Composite models**: Different models for different tasks
- **Streaming validation**: Check output while generating
- **Framework focus**: Deep knowledge beats broad coverage

### Lovable
- **Documentation as infrastructure**: Generated code documents itself
- **Full-stack generation**: Complete working applications
- **Clean code**: Readability over cleverness

### Cursor Background Agents
- **Parallel execution**: Multiple agents working together
- **Git integration**: Work on branches, not main
- **Multiple access points**: CLI, web, IDE

## Framework-Specific Advantages

Being Mastra-specific gives us:

1. **Deep validation**: Know every valid configuration
2. **Smart defaults**: Generate idiomatic Mastra code
3. **Type safety**: Leverage Zod schemas everywhere
4. **Integration**: Works with existing Mastra tools

## Code Editing Innovation

### Problem with Find/Replace
- 40%+ failure rate on whitespace/formatting
- Cascading failures increase costs
- Context pollution from retries

### AST Transform Solution
- Structural matching ignores formatting
- Framework-specific transformations
- ~95% success rate vs ~60% for find/replace

Example transforms:
- Add tool to agent
- Update configuration
- Add memory system
- Convert to dynamic agent

## Design Principles

### Progressive Disclosure
Start simple, add complexity as needed. Basic agent → tools → memory → workflows.

### Fail Fast with Help
When something fails, provide clear next steps and alternatives.

### Convention over Configuration
Use Mastra best practices by default, allow customization when needed.

### Testing First
Generate tests alongside code. Validate before showing to user.

## Anti-Patterns to Avoid

1. **Monolithic generation**: Build incrementally
2. **Generic templates**: Use Mastra-specific patterns
3. **Ignoring context**: Each generation builds on previous
4. **Over-promising**: Be clear about limitations

## Success Factors

1. **Concrete capabilities**: Not vanity metrics
2. **Reliable generation**: Works first time
3. **Learning system**: Improve from usage
4. **Clear documentation**: Examples over explanations