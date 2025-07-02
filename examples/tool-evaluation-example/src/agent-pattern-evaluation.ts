import { openai } from '@ai-sdk/openai';
import { createTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';
import { registerHook, AvailableHooks } from '@mastra/core';
import { z } from 'zod';

// Configure the model for evaluation
const model = openai('gpt-4o-mini');

// Create a tool with built-in evaluations (following Agent pattern)
const weatherTool = createTool({
  id: 'weather-tool',
  description: 'Get weather information for a location',
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ context }) => {
    const { location } = context;
    
    // Simulate weather API call
    const conditions = ['sunny', 'cloudy', 'rainy', 'snowy'];
    const temperature = Math.floor(Math.random() * 40) + 50; // 50-90°F
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return `The weather in ${location} is ${condition} with a temperature of ${temperature}°F.`;
  },
  // Built-in evaluations (like Agents)
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
  },
});

// Create a calculator tool with multiple evaluations
const calculatorTool = createTool({
  id: 'calculator',
  description: 'Performs basic arithmetic operations',
  inputSchema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ context }) => {
    const { operation, a, b } = context;
    
    switch (operation) {
      case 'add':
        return { result: a + b, expression: `${a} + ${b} = ${a + b}` };
      case 'subtract':
        return { result: a - b, expression: `${a} - ${b} = ${a - b}` };
      case 'multiply':
        return { result: a * b, expression: `${a} * ${b} = ${a * b}` };
      case 'divide':
        if (b === 0) throw new Error('Division by zero');
        return { result: a / b, expression: `${a} / ${b} = ${a / b}` };
      default:
        throw new Error('Unknown operation');
    }
  },
  // Multiple evaluation metrics
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
    // Could add more metrics here like accuracy, performance, etc.
  },
});

// Register hook to monitor tool evaluations (like Agent evaluations)
registerHook(AvailableHooks.ON_TOOL_EVALUATION, (data) => {
  console.log(`📊 Tool Evaluation - ${data.toolId}:`);
  console.log(`   Metric: ${data.metricName}`);
  console.log(`   Success: ${data.success}`);
  console.log(`   Execution Time: ${data.executionTime}ms`);
  if (data.error) {
    console.log(`   Error: ${data.error}`);
  }
  console.log(`   Run ID: ${data.runId}`);
  console.log('');
});

async function demonstrateAgentPatternEvaluations() {
  console.log('🧪 Demonstrating Agent-Pattern Tool Evaluations\n');

  // Example 1: Weather tool with automatic evaluation
  console.log('🌤️  Running Weather Tool (with built-in evaluations)');
  try {
    const weatherResult = await weatherTool.run({
      context: { location: 'San Francisco' },
      runtimeContext: { runId: 'weather-demo', globalRunId: 'demo-session' },
    }, { runId: 'weather-1' });

    console.log('✅ Weather Result:', weatherResult);
  } catch (error) {
    console.error('❌ Weather tool failed:', error);
  }

  console.log('\n🧮 Running Calculator Tool (with built-in evaluations)');
  try {
    const calcResult = await calculatorTool.run({
      context: { operation: 'add', a: 15, b: 25 },
      runtimeContext: { runId: 'calc-demo', globalRunId: 'demo-session' },
    }, { runId: 'calc-1' });

    console.log('✅ Calculator Result:', calcResult);
  } catch (error) {
    console.error('❌ Calculator tool failed:', error);
  }

  // Example 2: Error handling with evaluations
  console.log('\n💥 Testing Error Handling (division by zero)');
  try {
    await calculatorTool.run({
      context: { operation: 'divide', a: 10, b: 0 },
      runtimeContext: { runId: 'error-demo', globalRunId: 'demo-session' },
    }, { runId: 'calc-error' });
  } catch (error) {
    console.log('✅ Expected error caught:', error.message);
  }
}

// Example of creating tools without evaluations (like Agents without evals)
const simpleEchoTool = createTool({
  id: 'echo',
  description: 'Simple echo tool without evaluations',
  inputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ context }) => {
    return `Echo: ${context.message}`;
  },
  // No evals property - no automatic evaluations
});

async function demonstrateToolsWithoutEvaluations() {
  console.log('\n🔇 Demonstrating Tools Without Evaluations\n');

  console.log('📢 Running Echo Tool (no evaluations)');
  try {
    const echoResult = await simpleEchoTool.run({
      context: { message: 'Hello, World!' },
      runtimeContext: { runId: 'echo-demo', globalRunId: 'demo-session' },
    }, { runId: 'echo-1' });

    console.log('✅ Echo Result:', echoResult);
    console.log('ℹ️  No evaluation hooks were triggered');
  } catch (error) {
    console.error('❌ Echo tool failed:', error);
  }
}

// Custom metric example (like custom Agent metrics)
class ToolPerformanceMetric {
  async measure(input: string, output: string) {
    // Simple performance metric based on execution time
    // In a real implementation, this would be more sophisticated
    return {
      score: 0.9, // Placeholder score
      info: {
        performanceCategory: 'good',
        details: 'Tool executed within acceptable time limits',
      },
    };
  }
}

const performanceToolExample = createTool({
  id: 'performance-example',
  description: 'Tool with custom performance metric',
  inputSchema: z.object({
    data: z.string(),
  }),
  execute: async ({ context }) => {
    // Simulate some processing
    await new Promise(resolve => setTimeout(resolve, 100));
    return `Processed: ${context.data}`;
  },
  evals: {
    relevancy: new AnswerRelevancyMetric(model),
    performance: new ToolPerformanceMetric() as any, // Type assertion for demo
  },
});

async function demonstrateCustomMetrics() {
  console.log('\n🎯 Demonstrating Custom Metrics\n');

  console.log('⚡ Running Tool with Custom Performance Metric');
  try {
    const result = await performanceToolExample.run({
      context: { data: 'sample data' },
      runtimeContext: { runId: 'perf-demo', globalRunId: 'demo-session' },
    }, { runId: 'perf-1' });

    console.log('✅ Performance Tool Result:', result);
  } catch (error) {
    console.error('❌ Performance tool failed:', error);
  }
}

// Run all demonstrations
if (require.main === module) {
  demonstrateAgentPatternEvaluations()
    .then(() => demonstrateToolsWithoutEvaluations())
    .then(() => demonstrateCustomMetrics())
    .then(() => console.log('\n🎉 All Agent-pattern evaluations completed!'))
    .catch(console.error);
}

export {
  weatherTool,
  calculatorTool,
  simpleEchoTool,
  performanceToolExample,
  demonstrateAgentPatternEvaluations,
  demonstrateToolsWithoutEvaluations,
  demonstrateCustomMetrics,
};