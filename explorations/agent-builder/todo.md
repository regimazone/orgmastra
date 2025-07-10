# TODO

## Immediate Next Steps

1. [ ] Set up package structure
   - Create `src/` with agent and tools
   - Set up TypeScript config
   - Add basic tests

2. [ ] Implement core agent
   - Basic Agent definition
   - Minimal viable instructions
   - Connect to OpenAI

3. [ ] Build first tool: configSnippetBuilder
   - Design input/output schemas
   - Create snippet templates
   - Test with simple agent generation

4. [ ] Create proof of concept
   - Generate one working agent
   - Validate it compiles
   - Document what works/doesn't

5. [ ] Get feedback
   - Share with team
   - Test with real use case
   - Iterate based on results

## Phase 1 Checklist

- [ ] Core agent working
- [ ] All 6 tools implemented
- [ ] Basic templates created
- [ ] AST transforms working
- [ ] Tests passing
- [ ] Documentation complete
- [ ] npm package published

## Open Questions

1. Use ast-grep directly or build wrapper?
2. How to handle Mastra version changes?
3. Best way to test generated agents?
4. Should templates be in package or separate?

## Not Yet

- CLI integration (Phase 2)
- Playground UI (Phase 3)  
- Cloud features (Phase 4)
- Learning system (Future)