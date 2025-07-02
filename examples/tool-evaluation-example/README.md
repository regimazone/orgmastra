# Tool Evaluation Example - Agent Pattern

This example demonstrates how to add evaluations to tools in @mastra/core following the same pattern as Agents.

## Key Features

- **Built-in Evaluations**: Tools can have `evals` property just like Agents
- **Automatic Evaluation**: Evaluations run automatically when tools execute
- **Hook Integration**: Monitor evaluations using the same hook system as Agents
- **Multiple Metrics**: Support for multiple evaluation metrics per tool
- **Error Handling**: Evaluations run even when tools fail

## How It Works

Just like Agents, tools can now have built-in evaluations:

```typescript
const weatherTool = createTool({
  id: 'weather-tool',
  description: 'Get weather information',
  execute: async ({ context }) => {
    return `Weather in ${context.location}: sunny, 75°F`;
  },
  // Built-in evaluations (same as Agents)
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
    accuracy: new CustomAccuracyMetric(),
  },
});
```

## Usage

### Basic Tool with Evaluations

```typescript
import { createTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';

const myTool = createTool({
  id: 'my-tool',
  description: 'My tool with evaluations',
  execute: async ({ context }) => {
    // Tool logic here
    return result;
  },
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
  },
});

// Run the tool - evaluations happen automatically
const result = await myTool.run({ 
  context: { input: 'test' },
  runtimeContext: { runId: 'test-1' }
});
```

### Monitoring Evaluations

```typescript
import { registerHook, AvailableHooks } from '@mastra/core';

registerHook(AvailableHooks.ON_TOOL_EVALUATION, (data) => {
  console.log('Tool evaluated:', {
    toolId: data.toolId,
    metric: data.metricName,
    success: data.success,
    executionTime: data.executionTime,
  });
});
```

### Tools Without Evaluations

```typescript
const simpleTool = createTool({
  id: 'simple-tool',
  description: 'Tool without evaluations',
  execute: async ({ context }) => {
    return `Echo: ${context.message}`;
  },
  // No evals property - no automatic evaluations
});
```

## Pattern Comparison

### Before (Standalone Evaluation)
```typescript
// Old pattern - manual evaluation
const result = await evaluateTool(tool, input, metric);
```

### After (Agent Pattern)
```typescript
// New pattern - built-in evaluations
const tool = createTool({
  // ... tool config
  evals: { metric1, metric2 } // Built-in like Agents
});

// Evaluations happen automatically
const result = await tool.run(context);
```

## Benefits

1. **Consistency**: Same pattern as Agents - familiar and predictable
2. **Automatic**: No need to remember to call evaluation functions
3. **Built-in**: Evaluations are part of the tool definition
4. **Monitoring**: Use existing hook system for tracking
5. **Optional**: Tools work fine without evaluations

## Examples

Run the examples to see the Agent pattern in action:

```bash
# Agent-pattern evaluations
npm run eval:agent-pattern

# Compare with tools without evaluations
npm run eval:no-evals

# Custom metrics example
npm run eval:custom
```

## Migration Guide

If you were using the old standalone evaluation functions:

### Old Way
```typescript
const result = await evaluateTool(tool, input, metric);
```

### New Way
```typescript
const tool = createTool({
  // ... existing config
  evals: { myMetric: metric } // Add this
});

// Just run the tool - evaluation happens automatically
const result = await tool.run(context);
```

The new approach is more consistent with how Agents work and requires less manual intervention.