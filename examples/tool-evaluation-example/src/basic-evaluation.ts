import { openai } from '@ai-sdk/openai';
import { createTool, evaluateTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';
import { z } from 'zod';

// Configure the model for evaluation
const model = openai('gpt-4o-mini');

// Create a simple calculator tool
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
});

// Create a weather tool
const weatherTool = createTool({
  id: 'weather',
  description: 'Get weather information for a location',
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ context }) => {
    const { location } = context;
    
    // Simulate weather API call
    const weatherData = {
      location,
      temperature: Math.floor(Math.random() * 40) + 50, // 50-90°F
      condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 50) + 30, // 30-80%
    };
    
    return `The weather in ${location} is ${weatherData.condition} with a temperature of ${weatherData.temperature}°F and ${weatherData.humidity}% humidity.`;
  },
});

async function runBasicEvaluation() {
  console.log('🧪 Running Basic Tool Evaluation Example\n');

  // Example 1: Evaluate calculator tool
  console.log('📊 Evaluating Calculator Tool');
  try {
    const calculatorResult = await evaluateTool(
      calculatorTool,
      {
        input: { operation: 'add', a: 5, b: 3 },
        expectedOutput: { result: 8, expression: '5 + 3 = 8' },
      },
      new AnswerRelevancyMetric(model),
      {
        runId: 'calc-eval-1',
        testInfo: { testName: 'Calculator Addition Test' },
      }
    );

    console.log('✅ Calculator Evaluation Result:', {
      score: calculatorResult.score,
      success: calculatorResult.success,
      executionTime: calculatorResult.executionTime,
      output: calculatorResult.output,
    });
  } catch (error) {
    console.error('❌ Calculator evaluation failed:', error);
  }

  console.log('\n📊 Evaluating Weather Tool');
  try {
    const weatherResult = await evaluateTool(
      weatherTool,
      {
        input: { location: 'San Francisco' },
        context: { expectedFormat: 'weather description' },
      },
      new AnswerRelevancyMetric(model),
      {
        runId: 'weather-eval-1',
        testInfo: { testName: 'Weather Tool Test' },
      }
    );

    console.log('✅ Weather Evaluation Result:', {
      score: weatherResult.score,
      success: weatherResult.success,
      executionTime: weatherResult.executionTime,
      output: weatherResult.output,
    });
  } catch (error) {
    console.error('❌ Weather evaluation failed:', error);
  }
}

// Custom metric example
class SimpleAccuracyMetric {
  async measure(input: string, output: string) {
    // Simple accuracy check - for demo purposes
    try {
      const inputObj = JSON.parse(input);
      const outputObj = JSON.parse(output);
      
      // For calculator, check if result is correct
      if (inputObj.operation === 'add') {
        const expectedResult = inputObj.a + inputObj.b;
        const actualResult = outputObj.result;
        const accuracy = actualResult === expectedResult ? 1.0 : 0.0;
        
        return {
          score: accuracy,
          info: {
            expected: expectedResult,
            actual: actualResult,
            correct: accuracy === 1.0,
          },
        };
      }
      
      return { score: 0.5, info: { message: 'Partial evaluation' } };
    } catch {
      return { score: 0, info: { error: 'Failed to parse input/output' } };
    }
  }
}

async function runCustomMetricEvaluation() {
  console.log('\n🔧 Running Custom Metric Evaluation\n');

  try {
    const customMetric = new SimpleAccuracyMetric();
    const result = await evaluateTool(
      calculatorTool,
      {
        input: { operation: 'add', a: 10, b: 15 },
      },
      customMetric as any, // Type assertion for demo
      {
        runId: 'custom-eval-1',
        testInfo: { testName: 'Custom Accuracy Test' },
      }
    );

    console.log('✅ Custom Metric Result:', {
      score: result.score,
      success: result.success,
      info: result.info,
    });
  } catch (error) {
    console.error('❌ Custom metric evaluation failed:', error);
  }
}

// Run the examples
if (require.main === module) {
  runBasicEvaluation()
    .then(() => runCustomMetricEvaluation())
    .then(() => console.log('\n🎉 All evaluations completed!'))
    .catch(console.error);
}

export {
  calculatorTool,
  weatherTool,
  runBasicEvaluation,
  runCustomMetricEvaluation,
};