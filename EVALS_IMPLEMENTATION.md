# Evals View Implementation

## Overview
I've created a dedicated evals view for the Mastra playground that displays all agents with their evaluation data in a table format, similar to the existing agents view.

## What Was Implemented

### 1. New Evals Page (`/evals`)
- **Location**: `packages/cli/src/playground/src/pages/evals/index.tsx`
- **Features**:
  - Shows all agents that have evaluation data
  - Displays eval statistics in a table format
  - Empty state when no evals are found
  - Clicking on a row navigates to the agent's eval detail page

### 2. Data Fetching Hook
- **Location**: `packages/cli/src/playground/src/domains/evals/hooks/use-agents-with-evals.ts`
- **Features**:
  - Fetches all agents and their eval data (both live and CI)
  - Calculates metrics: total evals, average score, last eval date
  - Filters out agents with no evals
  - Sorts by total eval count (descending)

### 3. Table Columns Configuration
- **Location**: `packages/cli/src/playground/src/domains/evals/table.columns.tsx`
- **Columns**:
  - **Agent**: Name with description (links to agent eval page)
  - **Model**: Provider badge with model ID
  - **Avg Score**: Visual score indicator with percentage and color coding
  - **Evaluations**: Total count with live/CI breakdown badges
  - **Last Eval**: Relative time since last evaluation

### 4. Navigation Integration
- **Sidebar**: Added "Evals" link to main navigation with TestTube icon
- **Routing**: Added `/evals` route to App.tsx

## UI Features

### Visual Elements
- **Score Indicators**: Color-coded scores (green ≥80%, yellow ≥60%, red <60%)
- **Badges**: Different badge styles for total, live, and CI eval counts
- **Time Display**: Human-readable relative time (e.g., "2h ago", "3d ago")
- **Provider Icons**: OpenAI and Anthropic provider icons

### Data Display
- **Filtering**: Only shows agents with evaluation data
- **Sorting**: Agents sorted by total evaluation count
- **Empty State**: Helpful message with documentation link when no evals exist

## Data Structure

```typescript
type AgentWithEvals = {
  id: string;
  name: string;
  description: string;
  provider: string;
  modelId: string;
  liveEvalsCount: number;
  ciEvalsCount: number;
  totalEvalsCount: number;
  lastEvalDate?: string;
  averageScore?: number;
  liveEvals: Evals[];
  ciEvals: Evals[];
};
```

## Integration with Existing System

### Leverages Existing Infrastructure
- Uses existing eval API endpoints (`/api/agents/:agentId/evals/ci` and `/api/agents/:agentId/evals/live`)
- Reuses existing `AgentEvals` component for individual agent eval details
- Follows established patterns from the agents view
- Uses existing UI components from `@mastra/playground-ui`

### Navigation Flow
1. **Evals Overview** (`/evals`) - Shows all agents with eval data
2. **Agent Eval Details** (`/agents/:agentId/evals`) - Detailed eval view for specific agent

## Benefits

1. **Centralized View**: See eval status across all agents at a glance
2. **Quick Navigation**: Easy access to detailed eval data for any agent
3. **Performance Metrics**: Immediate visibility into eval scores and activity
4. **Consistent UX**: Follows established Mastra playground patterns
5. **Scalable**: Works well with any number of agents and evaluations

## Next Steps

The implementation is complete and ready for use. Users can now:
- Navigate to `/evals` to see all agent evaluation data
- Click on any agent to view detailed eval results
- Monitor eval performance across their entire agent fleet

The view will automatically update as new evaluations are run and will show real-time eval statistics.