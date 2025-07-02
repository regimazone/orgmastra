# Tool Evaluation - Agent Pattern Implementation

## Overview

I have successfully implemented tool evaluations in @mastra/core following the exact same pattern as Agents. This ensures consistency across the framework and provides a familiar, intuitive API for developers.

## Key Implementation Details

### 1. **Agent Pattern Consistency**

Tools now work exactly like Agents when it comes to evaluations:

```typescript
// Agent with evaluations
const agent = new Agent({
  name: 'my-agent',
  model: openai('gpt-4'),
  instructions: 'You are a helpful assistant',
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
  },
});

// Tool with evaluations (same pattern)
const tool = createTool({
  id: 'my-tool',
  description: 'My helpful tool',
  execute: async ({ context }) => { /* logic */ },
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
  },
});
```

### 2. **Automatic Evaluation Triggering**

Just like Agents, evaluations happen automatically when the tool executes:

- **Agents**: Evaluations trigger after `agent.generate()`
- **Tools**: Evaluations trigger after `tool.run()`

### 3. **Built-in Hook Integration**

Uses the same hook system as Agents:

- **Agent Hook**: `AvailableHooks.ON_EVALUATION`
- **Tool Hook**: `AvailableHooks.ON_TOOL_EVALUATION`

## Implementation Changes

### 1. **Tool Types Extended**

**File: `packages/core/src/tools/types.ts`**

```typescript
export interface ToolAction<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
  TMetrics extends Record<string, Metric> = Record<string, Metric>, // Added
> extends IAction<string, TSchemaIn, TSchemaOut, TContext, ToolExecutionOptions> {
  description: string;
  execute?: (context: TContext, options?: ToolExecutionOptions) => Promise<any>;
  mastra?: Mastra;
  evals?: TMetrics; // Added - same as Agent
}
```

### 2. **Tool Class Updated**

**File: `packages/core/src/tools/tool.ts`**

```typescript
export class Tool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
  TMetrics extends Record<string, Metric> = Record<string, Metric>, // Added
> implements ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics> {
  // ... existing properties
  evals: TMetrics; // Added - same as Agent

  constructor(opts: ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics>) {
    // ... existing initialization
    this.evals = opts.evals || ({} as TMetrics); // Added
  }

  // New method: run with automatic evaluations
  async run(context: TContext, options?: { runId?: string }) {
    // Execute tool
    const result = await this.execute(context, options);
    
    // Trigger evaluations automatically (like Agents)
    if (Object.keys(this.evals || {}).length > 0) {
      for (const metric of Object.values(this.evals || {})) {
        executeHook(AvailableHooks.ON_TOOL_EVALUATION, {
          toolId: this.id,
          // ... evaluation data
        });
      }
    }
    
    return result;
  }
}
```

### 3. **Hook System Extended**

**File: `packages/core/src/hooks/index.ts`**

```typescript
export enum AvailableHooks {
  ON_EVALUATION = 'onEvaluation',      // Agent evaluations
  ON_GENERATION = 'onGeneration',      // Agent generations  
  ON_TOOL_EVALUATION = 'onToolEvaluation', // Tool evaluations (new)
}

type ToolEvaluationHookData = {
  toolId: string;
  toolDescription: string;
  input: any;
  output: any;
  result: MetricResult;
  metricName: string;
  executionTime: number;
  success: boolean;
  error?: string;
  runId: string;
  globalRunId: string;
  testInfo?: TestInfo;
};
```

## Usage Examples

### 1. **Basic Tool with Evaluations**

```typescript
import { createTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';

const weatherTool = createTool({
  id: 'weather-tool',
  description: 'Get weather information',
  execute: async ({ context }) => {
    return `Weather in ${context.location}: sunny, 75°F`;
  },
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
  },
});

// Run tool - evaluations happen automatically
const result = await weatherTool.run({
  context: { location: 'San Francisco' },
  runtimeContext: { runId: 'weather-1' }
});
```

### 2. **Multiple Metrics**

```typescript
const calculatorTool = createTool({
  id: 'calculator',
  description: 'Perform calculations',
  execute: async ({ context }) => {
    return { result: context.a + context.b };
  },
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
    accuracy: new CustomAccuracyMetric(),
    performance: new PerformanceMetric(),
  },
});
```

### 3. **Monitoring Evaluations**

```typescript
import { registerHook, AvailableHooks } from '@mastra/core';

registerHook(AvailableHooks.ON_TOOL_EVALUATION, (data) => {
  console.log('Tool Evaluation:', {
    tool: data.toolId,
    metric: data.metricName,
    score: data.result.score,
    time: data.executionTime,
    success: data.success,
  });
});
```

### 4. **Tools Without Evaluations**

```typescript
const simpleTool = createTool({
  id: 'simple-tool',
  description: 'Simple tool without evaluations',
  execute: async ({ context }) => {
    return `Echo: ${context.message}`;
  },
  // No evals property - no automatic evaluations
});
```

## Benefits of the Agent Pattern

### 1. **Consistency**
- Same API pattern as Agents
- Familiar to developers already using Agents
- Consistent behavior across the framework

### 2. **Automatic**
- No need to manually call evaluation functions
- Evaluations happen as part of normal tool execution
- Reduces developer cognitive load

### 3. **Built-in**
- Evaluations are part of the tool definition
- Clear declaration of what metrics apply to each tool
- Self-documenting code

### 4. **Optional**
- Tools work perfectly fine without evaluations
- Easy to add/remove evaluations
- No breaking changes to existing tools

### 5. **Monitoring**
- Uses existing hook system
- Consistent monitoring across Agents and Tools
- Easy to track all evaluations in one place

## Comparison: Before vs After

### Before (Standalone Pattern)
```typescript
// Manual evaluation - easy to forget
const tool = createTool({ /* config */ });
const result = await tool.execute(context);
const evaluation = await evaluateTool(tool, input, metric); // Manual
```

### After (Agent Pattern)
```typescript
// Automatic evaluation - built-in
const tool = createTool({
  // ... config
  evals: { metric } // Declared upfront
});
const result = await tool.run(context); // Evaluation happens automatically
```

## Migration Guide

For existing tools, simply add the `evals` property:

```typescript
// Existing tool
const myTool = createTool({
  id: 'my-tool',
  description: 'My tool',
  execute: async ({ context }) => { /* existing logic */ },
});

// Add evaluations
const myTool = createTool({
  id: 'my-tool',
  description: 'My tool', 
  execute: async ({ context }) => { /* existing logic */ },
  evals: { // Add this
    relevancy: new AnswerRelevancyMetric(model),
  },
});

// Change from execute() to run()
// Before: await myTool.execute(context)
// After:  await myTool.run(context)
```

## Example Project

Created a comprehensive example at `examples/tool-evaluation-example/` demonstrating:

- Tools with built-in evaluations
- Tools without evaluations
- Multiple metrics per tool
- Custom metrics
- Evaluation monitoring
- Error handling

## Conclusion

The Agent-pattern implementation provides:

✅ **Consistency** with existing Agent API  
✅ **Automatic** evaluation triggering  
✅ **Built-in** evaluation configuration  
✅ **Optional** evaluation support  
✅ **Familiar** developer experience  
✅ **Monitoring** via existing hooks  
✅ **Backward compatibility** with existing tools  

This approach ensures that tool evaluations feel natural and consistent within the Mastra ecosystem while providing powerful evaluation capabilities for tool quality assurance and performance monitoring.