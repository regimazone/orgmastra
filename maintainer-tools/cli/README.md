# Mastra Maintainer Tools

Interactive CLI tools for Mastra maintainers to debug issues and smoke test releases.

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated:
  ```bash
  brew install gh
  gh auth login
  ```

## Setup

```bash
cd maintainer-tools/cli
pnpm run setup  # Installs dependencies isolated from monorepo
```

## Tools

### 🔍 Debug Issue CLI

Debug GitHub issues with an interactive agent that can analyze code, run commands, and help investigate problems. You can start new debug sessions or resume existing ones.

```bash
# Interactive mode - start new or resume existing session
npx tsx src/debug-issue.ts

# Debug specific issue
npx tsx src/debug-issue.ts 1234
npx tsx src/debug-issue.ts https://github.com/mastra-ai/mastra/issues/1234

# With custom repo
npx tsx src/debug-issue.ts --repo owner/repo 123
```

**Features:**
- Resume existing debug sessions or start new ones
- Fetches issue details and comments from GitHub using `gh` CLI
- Scaffolds a Mastra project with a powerful debugging agent
- Launches the Mastra playground UI for agent interaction
- Uses MCP (Model Context Protocol) servers for robust tooling:
  - **Filesystem Server**: Read, write, and explore files in both the debug project and monorepo
  - **Mastra Docs Server** (@mastra/mcp-docs-server): Access to official Mastra documentation, examples, blog posts, and changelogs
  - Sandboxed access to specific directories for security
  - Standard MCP protocol for reliable tool interactions
- Agent has full context about the issue embedded in its instructions
- Includes workflow capabilities for complex debugging sequences
- **Reproduction workflow**: Run from the playground UI to have the agent automatically:
  - Analyze the issue and create a reproduction strategy
  - Generate reproduction files in `src/reproductions/`
  - Test the reproduction to verify it demonstrates the issue
- Agent can create and modify code in the debug project using MCP filesystem tools
- Provides detailed debugging instructions and tips

### 🧪 Smoke Test CLI

Manually test different versions of Mastra by scaffolding a project and running the dev server. You can start new test sessions or resume existing ones.

```bash
# Interactive mode (recommended)
npx tsx src/smoke-test.ts

# Test specific versions
npx tsx src/smoke-test.ts --latest    # Latest published
npx tsx src/smoke-test.ts --alpha     # Alpha releases
npx tsx src/smoke-test.ts --local     # Current branch (builds first)
npx tsx src/smoke-test.ts --version 0.1.45  # Specific version

# Skip local build
npx tsx src/smoke-test.ts --local --skip-build
```

**Features:**
- Resume existing test sessions or start new ones
- Automatically launches the Mastra playground UI
- Interactive project configuration
- Automatic dependency installation
- API key validation warnings
- Readable project names with ISO timestamps
- No interrupting prompts - smooth workflow

**Interactive Flow:**
1. Choose to resume existing project or create new
2. If new: Select version to test (latest, alpha, local, custom)
3. Choose features to include (agent, workflows, memory, etc.)
4. Pick AI provider (OpenAI, Anthropic, Groq, Google)
5. Automatically scaffolds project and starts playground

## Architecture

```
maintainer-tools/
├── cli/
│   ├── src/
│   │   ├── debug-issue.ts      # Debug CLI entry
│   │   ├── smoke-test.ts       # Smoke test CLI entry
│   │   └── lib/
│   │       ├── github/         # GitHub API integration
│   │       ├── scaffolding/    # Project creation
│   │       ├── ui/             # TUI components
│   │       └── agents/         # Agent configs
│   └── package.json
└── test-projects/              # Generated projects
    ├── debug-issue-123/
    └── smoke-test-alpha-xxx/
```

## Development

The tools use:
- **blessed** - Terminal UI framework
- **chalk** - Terminal colors
- **inquirer** - Interactive prompts
- **commander** - CLI argument parsing
- **gh CLI** - GitHub integration
- **execa** - Process execution
- **ora** - Elegant spinners
- **@mastra/mcp** - MCP client for debug agent tools

### Testing

Run tests with:
```bash
pnpm test          # Run all tests
pnpm test:watch    # Run tests in watch mode
```

Tests cover:
- GitHub issue fetching with mocked `gh` CLI
- Project scaffolding and file creation
- MCP server configuration
- Error handling (gh not installed, not authenticated)
- Workflow creation and syntax error fixes

## Notes

- This directory is gitignored to keep it isolated from the monorepo
- Projects are scaffolded in `test-projects/` directory
- For local testing, packages are built and linked automatically
- Debug agent requires AI provider API key (defaults to Anthropic)
- Smoke tests default to OpenAI for testing

## Known Issues

- If individual `pnpm-lock.yaml` files appear in package directories, this indicates pnpm isn't recognizing the workspace context. This shouldn't happen with the current implementation, but if it does, clean them with:
  ```bash
  find . -name "pnpm-lock.yaml" -not -path "./pnpm-lock.yaml" -delete
  ```
  This is a bug that needs investigation, not expected behavior.

## Recent Updates

### Fixed Issues (2025-06-27)

1. **Working Directory Handling**: Fixed reproduction workflow to read ISSUE_DETAILS.md correctly when running in `mastra dev` context (which changes cwd to `.mastra/output`)
2. **Agent Export Naming**: Fixed smoke test projects to import `agent` instead of `debugAgent` (debug projects use `debugAgent`, regular projects use `agent`)
3. **Model Configuration**: Updated to use Claude 4 Sonnet with correct format: `claude-4-sonnet-20250514`
4. **Smoke Test Improvements**:
   - Added resume functionality - can now resume existing smoke test projects
   - Removed interactive prompts - automatically starts the playground
   - Improved project naming with readable timestamps (YYYY-MM-DDTHH-MM-SS)
   - Streamlined experience to match debug-issue tool behavior
5. **Local Package Linking**: Fixed local mode to use symlinks for local packages, ensuring all dependencies are available
6. **Fixed libsql location**: Corrected path for @mastra/libsql (it's in stores/, not packages/)
7. **Build stores packages**: Local mode now builds both packages and stores to ensure libsql is available
8. **Fixed missing dependencies**: Added execa and glob to generated project dependencies to fix bundler errors
9. **Improved local mode transparency**: Added clear console output showing which packages are linked to local builds
10. **Fixed smoke test resume functionality**: Corrected the path where smoke-test.ts looks for existing projects