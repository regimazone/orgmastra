import { openai } from '@ai-sdk/openai';
import { createTool, evaluateTools, benchmarkTool } from '@mastra/core/tools';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';
import { z } from 'zod';

const model = openai('gpt-4o-mini');

// Create multiple weather tools with different implementations
const weatherToolV1 = createTool({
  id: 'weather-v1',
  description: 'Weather tool v1 - basic implementation',
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ context }) => {
    return `Weather in ${context.location}: Sunny, 72°F`;
  },
});

const weatherToolV2 = createTool({
  id: 'weather-v2', 
  description: 'Weather tool v2 - enhanced implementation',
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ context }) => {
    const conditions = ['sunny', 'cloudy', 'rainy'];
    const temp = Math.floor(Math.random() * 30) + 60;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    return `Current weather in ${context.location}: ${condition}, ${temp}°F with light winds`;
  },
});

const weatherToolV3 = createTool({
  id: 'weather-v3',
  description: 'Weather tool v3 - detailed implementation', 
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ context }) => {
    const weatherData = {
      location: context.location,
      temperature: Math.floor(Math.random() * 40) + 50,
      condition: 'partly cloudy',
      humidity: 65,
      windSpeed: 8,
      forecast: '3-day outlook: mild temperatures expected'
    };
    
    return `Weather report for ${weatherData.location}: ${weatherData.condition}, ${weatherData.temperature}°F, humidity ${weatherData.humidity}%, wind ${weatherData.windSpeed} mph. ${weatherData.forecast}`;
  },
});

async function runBatchEvaluation() {
  console.log('🔄 Running Batch Tool Evaluation\n');

  const tools = [weatherToolV1, weatherToolV2, weatherToolV3];
  const metric = new AnswerRelevancyMetric(model);

  try {
    const results = await evaluateTools(
      tools,
      {
        input: { location: 'New York' },
        context: { expectedType: 'weather information' },
      },
      metric,
      {
        globalRunId: 'batch-eval-1',
        testInfo: { testName: 'Weather Tools Comparison' },
      }
    );

    console.log('📊 Batch Evaluation Results:\n');
    
    results.forEach((result, index) => {
      const tool = tools[index];
      console.log(`🔧 ${tool.id}:`);
      console.log(`   Score: ${result.score.toFixed(3)}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Execution Time: ${result.executionTime}ms`);
      console.log(`   Output: ${result.output.substring(0, 100)}...`);
      console.log('');
    });

    // Find the best performing tool
    const bestResult = results.reduce((best, current, index) => 
      current.score > best.score ? { ...current, index } : best, 
      { ...results[0], index: 0 }
    );

    console.log(`🏆 Best performing tool: ${tools[bestResult.index].id} (Score: ${bestResult.score.toFixed(3)})`);

  } catch (error) {
    console.error('❌ Batch evaluation failed:', error);
  }
}

async function runBenchmarkEvaluation() {
  console.log('\n⚡ Running Benchmark Evaluation\n');

  const testInputs = [
    { input: { location: 'San Francisco' } },
    { input: { location: 'London' } },
    { input: { location: 'Tokyo' } },
    { input: { location: 'Sydney' } },
    { input: { location: 'Berlin' } },
  ];

  const metric = new AnswerRelevancyMetric(model);

  try {
    console.log('📈 Benchmarking weatherToolV3 with multiple inputs...');
    
    const benchmarkResults = await benchmarkTool(
      weatherToolV3,
      testInputs,
      metric,
      {
        globalRunId: 'benchmark-1',
        testInfo: { testName: 'Weather Tool Benchmark' },
      }
    );

    console.log('\n📊 Benchmark Results:\n');
    
    benchmarkResults.forEach((result, index) => {
      const input = testInputs[index];
      console.log(`🌍 ${input.input.location}:`);
      console.log(`   Score: ${result.score.toFixed(3)}`);
      console.log(`   Execution Time: ${result.executionTime}ms`);
      console.log(`   Success: ${result.success}`);
      console.log('');
    });

    // Calculate statistics
    const scores = benchmarkResults.map(r => r.score);
    const executionTimes = benchmarkResults.map(r => r.executionTime || 0);
    
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const avgExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    
    console.log('📈 Benchmark Statistics:');
    console.log(`   Average Score: ${avgScore.toFixed(3)}`);
    console.log(`   Score Range: ${minScore.toFixed(3)} - ${maxScore.toFixed(3)}`);
    console.log(`   Average Execution Time: ${avgExecutionTime.toFixed(1)}ms`);
    console.log(`   Success Rate: ${benchmarkResults.filter(r => r.success).length}/${benchmarkResults.length}`);

  } catch (error) {
    console.error('❌ Benchmark evaluation failed:', error);
  }
}

// Performance comparison
async function runPerformanceComparison() {
  console.log('\n🏁 Running Performance Comparison\n');

  const tools = [weatherToolV1, weatherToolV2, weatherToolV3];
  const metric = new AnswerRelevancyMetric(model);
  const testLocation = 'Paris';

  console.log('⚡ Comparing tool performance...\n');

  for (const tool of tools) {
    try {
      const startTime = Date.now();
      
      const result = await tool.evaluate(
        { input: { location: testLocation } },
        metric,
        { 
          runId: `perf-${tool.id}`,
          testInfo: { testName: 'Performance Test' }
        }
      );
      
      const totalTime = Date.now() - startTime;
      
      console.log(`🔧 ${tool.id}:`);
      console.log(`   Total Time: ${totalTime}ms`);
      console.log(`   Execution Time: ${result.executionTime}ms`);
      console.log(`   Score: ${result.score.toFixed(3)}`);
      console.log(`   Efficiency: ${(result.score / (result.executionTime || 1) * 1000).toFixed(2)} score/sec`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ ${tool.id} performance test failed:`, error);
    }
  }
}

// Run all examples
if (require.main === module) {
  runBatchEvaluation()
    .then(() => runBenchmarkEvaluation())
    .then(() => runPerformanceComparison())
    .then(() => console.log('\n🎉 All batch evaluations completed!'))
    .catch(console.error);
}

export {
  weatherToolV1,
  weatherToolV2,
  weatherToolV3,
  runBatchEvaluation,
  runBenchmarkEvaluation,
  runPerformanceComparison,
};