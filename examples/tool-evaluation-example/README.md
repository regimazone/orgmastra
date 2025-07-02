# Tool Evaluation Example

This example demonstrates how to evaluate tools in @mastra/core using the new tool evaluation functionality.

## Features

- **Tool Performance Evaluation**: Measure tool accuracy, execution time, and reliability
- **Multiple Evaluation Metrics**: Use built-in metrics or create custom ones
- **Batch Evaluation**: Evaluate multiple tools or multiple inputs
- **Evaluation Hooks**: Track and log evaluation results

## Setup

```bash
npm install
```

## Usage

### Basic Tool Evaluation

```typescript
import { createTool, evaluateTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';

// Create a tool
const weatherTool = createTool({
  id: 'weather-tool',
  description: 'Get weather information for a location',
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ context }) => {
    // Simulate weather API call
    return `The weather in ${context.location} is sunny and 75°F`;
  },
});

// Evaluate the tool
const result = await evaluateTool(
  weatherTool,
  {
    input: { location: 'San Francisco' },
    expectedOutput: 'Weather information for San Francisco',
  },
  new AnswerRelevancyMetric(model)
);

console.log('Evaluation Result:', result);
```

### Custom Tool Metrics

```typescript
import { Metric } from '@mastra/core';

class ToolAccuracyMetric extends Metric {
  async measure(input: string, output: string): Promise<MetricResult> {
    // Custom evaluation logic
    const accuracy = calculateAccuracy(input, output);
    return {
      score: accuracy,
      info: { accuracy, details: 'Custom accuracy calculation' }
    };
  }
}
```

### Batch Evaluation

```typescript
// Evaluate multiple tools with the same input
const tools = [weatherTool, alternativeWeatherTool];
const results = await evaluateTools(
  tools,
  { input: { location: 'New York' } },
  new AnswerRelevancyMetric(model)
);

// Benchmark a tool with multiple inputs
const inputs = [
  { input: { location: 'San Francisco' } },
  { input: { location: 'New York' } },
  { input: { location: 'London' } },
];

const benchmarkResults = await benchmarkTool(
  weatherTool,
  inputs,
  new AnswerRelevancyMetric(model)
);
```

## Evaluation Metrics

### Built-in Metrics

- **Answer Relevancy**: Measures how relevant the tool output is to the input
- **Execution Time**: Measures tool performance timing
- **Output Format**: Validates output format and structure
- **Error Handling**: Tests tool robustness with invalid inputs

### Custom Metrics

Create custom metrics by extending the `Metric` class:

```typescript
class CustomToolMetric extends Metric {
  async measure(input: string, output: string): Promise<MetricResult> {
    // Your evaluation logic here
    return {
      score: 0.85,
      info: { /* additional details */ }
    };
  }
}
```

## Evaluation Hooks

Monitor evaluation results in real-time:

```typescript
import { registerHook, AvailableHooks } from '@mastra/core';

registerHook(AvailableHooks.ON_TOOL_EVALUATION, (data) => {
  console.log('Tool Evaluation:', {
    toolId: data.toolId,
    score: data.result.score,
    executionTime: data.executionTime,
    success: data.success,
  });
});
```

## Running the Examples

```bash
# Run basic evaluation
npm run eval:basic

# Run batch evaluation
npm run eval:batch

# Run custom metrics
npm run eval:custom

# Run performance benchmarks
npm run eval:benchmark
```