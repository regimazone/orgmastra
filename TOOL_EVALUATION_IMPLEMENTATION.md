# Tool Evaluation Implementation for @mastra/core

## Overview

I have successfully added comprehensive evaluation capabilities to tools in @mastra/core. This implementation allows developers to measure tool performance, accuracy, execution time, and reliability using various metrics.

## Implementation Details

### 1. Core Types and Interfaces

**File: `packages/core/src/tools/types.ts`**
- Added `ToolEvaluationInput` interface for evaluation input data
- Added `ToolEvaluationResult` interface extending `MetricResult` with tool-specific data
- Added `ToolEvaluationOptions` interface for evaluation configuration
- Added `ToolEvaluationFunction` type for evaluation functions

### 2. Tool Class Extensions

**File: `packages/core/src/tools/tool.ts`**
- Extended the `Tool` class with an `evaluate()` method
- Added proper error handling and timing measurement
- Integrated with the evaluation hook system
- Support for custom metrics and evaluation options

### 3. Standalone Evaluation Functions

**File: `packages/core/src/tools/evaluation.ts`**
- `evaluateTool()` - Evaluate a single tool with a metric
- `evaluateTools()` - Evaluate multiple tools with the same input
- `benchmarkTool()` - Run benchmark tests with multiple inputs
- Proper error handling and performance measurement

### 4. Hook System Integration

**File: `packages/core/src/hooks/index.ts`**
- Added `ON_TOOL_EVALUATION` hook type
- Added `ToolEvaluationHookData` interface
- Integrated tool evaluations with the existing hook system

### 5. Export Updates

**File: `packages/core/src/tools/index.ts`**
- Exported all new evaluation types and functions
- Made tool evaluation functionality available to consumers

## Key Features

### 1. **Tool Performance Evaluation**
```typescript
const result = await tool.evaluate(
  { input: { location: 'San Francisco' } },
  new AnswerRelevancyMetric(model),
  { runId: 'test-1' }
);
```

### 2. **Batch Tool Evaluation**
```typescript
const results = await evaluateTools(
  [toolA, toolB, toolC],
  { input: { query: 'test' } },
  metric
);
```

### 3. **Tool Benchmarking**
```typescript
const benchmarkResults = await benchmarkTool(
  tool,
  [input1, input2, input3],
  metric
);
```

### 4. **Custom Metrics Support**
```typescript
class CustomToolMetric extends Metric {
  async measure(input: string, output: string): Promise<MetricResult> {
    // Custom evaluation logic
    return { score: 0.85, info: { details: '...' } };
  }
}
```

### 5. **Evaluation Hooks**
```typescript
registerHook(AvailableHooks.ON_TOOL_EVALUATION, (data) => {
  console.log('Tool evaluated:', data.toolId, data.result.score);
});
```

## Integration with Existing Systems

### 1. **Metrics Compatibility**
- Works with existing LLM metrics (AnswerRelevancyMetric, HallucinationMetric, etc.)
- Works with NLP metrics (ContentSimilarityMetric, ToneConsistencyMetric, etc.)
- Supports custom metrics extending the base Metric class

### 2. **Hook System**
- Integrates with existing evaluation hooks
- Provides tool-specific evaluation data
- Non-blocking execution to avoid performance impact

### 3. **Error Handling**
- Uses existing MastraError system
- Proper error categorization and domain assignment
- Detailed error context for debugging

## Usage Examples

### Basic Tool Evaluation
```typescript
import { createTool, evaluateTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';

const weatherTool = createTool({
  id: 'weather',
  description: 'Get weather info',
  execute: async ({ context }) => {
    return `Weather in ${context.location}: sunny, 75°F`;
  },
});

const result = await evaluateTool(
  weatherTool,
  { input: { location: 'SF' } },
  new AnswerRelevancyMetric(model)
);
```

### Performance Comparison
```typescript
const tools = [weatherV1, weatherV2, weatherV3];
const results = await evaluateTools(
  tools,
  { input: { location: 'NYC' } },
  metric
);

// Find best performing tool
const best = results.reduce((a, b) => a.score > b.score ? a : b);
```

### Benchmark Testing
```typescript
const inputs = [
  { input: { location: 'SF' } },
  { input: { location: 'NYC' } },
  { input: { location: 'LA' } },
];

const results = await benchmarkTool(tool, inputs, metric);
const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
```

## Example Project

Created a comprehensive example project at `examples/tool-evaluation-example/` demonstrating:

- Basic tool evaluation
- Batch evaluation of multiple tools
- Benchmark testing with multiple inputs
- Custom metrics creation
- Performance comparison
- Evaluation hooks usage

## Benefits

1. **Tool Quality Assurance**: Measure and validate tool performance
2. **A/B Testing**: Compare different tool implementations
3. **Performance Monitoring**: Track execution time and success rates
4. **Regression Testing**: Ensure tool improvements don't break functionality
5. **Metric Flexibility**: Use existing or custom evaluation metrics
6. **Integration Ready**: Works seamlessly with existing Mastra infrastructure

## Future Enhancements

1. **Tool-Specific Metrics**: Create metrics designed specifically for tool evaluation
2. **Evaluation Reports**: Generate detailed evaluation reports and visualizations
3. **Automated Testing**: Integration with CI/CD for automated tool testing
4. **Performance Baselines**: Establish and track performance baselines over time
5. **Evaluation Pipelines**: Create evaluation workflows for complex tool chains

## Conclusion

The tool evaluation implementation provides a robust, flexible, and extensible framework for evaluating tool performance in @mastra/core. It integrates seamlessly with existing systems while providing powerful new capabilities for tool quality assurance and performance monitoring.