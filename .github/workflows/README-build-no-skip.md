# Build All Packages GitHub Action

This workflow (`build-no-skip.yml`) builds all packages in the Mastra monorepo without any conditional skipping logic.

## Purpose

Unlike other workflows in this repository that conditionally skip builds/tests based on file changes, this workflow:

- Always builds all packages regardless of what files changed
- Runs on every push to main and every pull request
- Can be manually triggered via workflow dispatch
- Provides comprehensive build validation without optimizations

## Key Differences from Other Workflows

### Other Workflows (e.g., lint.yml, test-\*.yml)

- Use `skip-tests` jobs that check for changes
- Skip builds/tests when certain packages haven't changed
- Optimize CI time by only running necessary tests
- Include conditions like: `if: needs.check-changes.outputs.package-changed == 'false'`

### This Workflow (build-no-skip.yml)

- No conditional logic - always runs
- Always builds ALL packages
- Always runs typecheck and lint
- Provides comprehensive validation regardless of changes

## When to Use

This workflow is useful for:

- Ensuring the entire codebase can build successfully
- Full validation before releases
- Testing infrastructure changes that might affect all packages
- Manual verification when unsure about build status

## Build Commands Used

The workflow uses these commands that build all packages:

- `pnpm build` - Builds all packages except examples and docs
- `pnpm typecheck` - Type checks all packages
- `pnpm lint` - Lints all packages

## Trigger Conditions

- **Push to main**: Validates the main branch always builds
- **Pull requests**: Validates PRs against main branch
- **Manual dispatch**: Can be triggered manually with a force build option

## Configuration

The workflow uses the same setup as other workflows:

- Node.js 20.19.1
- pnpm package manager
- Turbo cache for faster builds
- 4GB memory allocation for builds
