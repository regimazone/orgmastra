# Reproduction Workflow Design

## Overview
The `reproduceIssueWorkflow` is designed for maintainers to use from the Mastra playground UI. It orchestrates the debug agent to automatically create minimal reproductions of GitHub issues.

## How It Works

### 1. Maintainer Perspective
- Open the playground UI for a debug project
- Navigate to the Workflows section
- Run `reproduceIssueWorkflow` with optional custom prompt
- Watch as the agent analyzes and creates reproduction files

### 2. Workflow Steps

#### Step 1: Analyze Issue with Agent
- Uses the debug agent to analyze the GitHub issue
- Creates a reproduction strategy
- Returns analysis and plan

#### Step 2: Create Reproduction with Agent
- Prompts the agent to create actual reproduction files
- Agent uses MCP filesystem tools to write files to `src/reproductions/`
- Creates:
  - Main reproduction file demonstrating the issue
  - Supporting configuration files
  - README explaining how to run the reproduction

#### Step 3: Test Reproduction
- Agent tests the reproduction files it created
- Verifies the issue is properly demonstrated
- Reports success/failure

#### Step 4: Summarize Results
- Combines all outputs into a final report
- Indicates whether reproduction was successful

## Key Design Decisions

1. **Workflow calls agent, not vice versa**: The workflow orchestrates the agent, making it a tool for maintainers rather than the agent.

2. **Automatic issue detection**: The workflow extracts the issue number from the project directory name (e.g., `debug-issue-123`).

3. **MCP tools for file operations**: The agent uses filesystem MCP tools to create files, ensuring proper sandboxing and control.

4. **Structured output**: Files are created in `src/reproductions/` with clear documentation.

## Usage Example

From the playground UI:
```javascript
// Just click "Execute" - no inputs needed!
// The workflow has built-in prompts for each step
await reproduceIssueWorkflow.execute({})
```

The workflow uses internal prompts to guide the agent:
1. **Analyze prompt**: Asks for detailed analysis and reproduction plan
2. **Create prompt**: Instructs agent to create files based on the plan
3. **Test prompt**: Asks agent to verify the reproduction works

## Benefits

1. **Consistency**: All reproductions follow the same structure
2. **Automation**: Reduces manual work for maintainers
3. **Documentation**: Automatically includes README and comments
4. **Verification**: Tests the reproduction before finishing
5. **Traceability**: Links reproductions to specific issues

## Technical Notes

### Working Directory Handling

When `mastra dev` runs, it bundles the project and changes the working directory to `.mastra/output`. The workflow handles this by:

1. **Reading issue details**: Attempts to read from `../../ISSUE_DETAILS.md` first (for mastra dev context), then falls back to `./ISSUE_DETAILS.md`
2. **Extracting issue number**: Detects when running in `.mastra/output` and extracts the project name from the parent directory
3. **Error reporting**: Provides detailed error messages showing attempted file paths to help with debugging

This ensures the workflow works correctly both during development and when running via the playground UI.