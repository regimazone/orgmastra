# @mastra/evals

A comprehensive evaluation framework for AI agents and language models.

## Installation

```bash
npm install @mastra/evals
```

## Overview

`@mastra/evals` provides a suite of evaluation metrics for assessing AI model outputs. The package includes both LLM-based and NLP-based metrics, enabling both automated and model-assisted evaluation of your AI systems.

## Features

- **LLM-based metrics**: Use language models to evaluate outputs (hallucination, bias, faithfulness, etc.)
- **NLP-based metrics**: Traditional text analysis metrics (similarity, completeness, etc.)
- **Automatic evaluation**: Integrate with agents for automatic evaluation on generation
- **Sampling support**: Control evaluation frequency to manage costs and performance
- **Storage integration**: Store evaluation results for analysis and monitoring

## Sampling

The evals package now supports sampling to control when evaluations are executed. This is particularly useful in production environments where you want to evaluate only a subset of requests to manage costs and performance.

### Sampling Strategies

#### 1. Ratio-based Sampling
Randomly sample a percentage of requests:

```typescript
import { configureSampling } from '@mastra/evals';

configureSampling({
  strategy: { type: 'ratio', probability: 0.1 } // 10% of requests
});
```

#### 2. Count-based Sampling
Sample every Nth request:

```typescript
configureSampling({
  strategy: { type: 'count', every: 10 } // Every 10th request
});
```

#### 3. Time-based Sampling
Sample based on time intervals:

```typescript
configureSampling({
  strategy: { type: 'time', intervalMs: 60000 } // Once per minute
});
```

#### 4. Custom Sampling
Use a custom function to determine sampling:

```typescript
configureSampling({
  strategy: { type: 'ratio', probability: 0.5 },
  shouldSample: ({ agentName, input }) => {
    // Only sample requests for specific agents or inputs
    return agentName === 'critical-agent' || input.includes('important');
  }
});
```

#### 5. No Sampling
Evaluate every request (default behavior):

```typescript
configureSampling({
  strategy: { type: 'none' }
});
```

### Usage with Agents

Once sampling is configured, it automatically applies to agent evaluations:

```typescript
import { configureSampling, attachListeners } from '@mastra/evals';
import { ContentSimilarityMetric, ToxicityMetric } from '@mastra/evals';

// Configure sampling
configureSampling({
  strategy: { type: 'ratio', probability: 0.1 } // 10% sampling
});

// Set up evaluation listeners
await attachListeners();

// Create agent with evaluations
const agent = new Agent({
  name: 'my-agent',
  instructions: 'You are a helpful assistant',
  model: openai('gpt-4'),
  evals: {
    similarity: new ContentSimilarityMetric(),
    toxicity: new ToxicityMetric(),
  }
});

// Evaluations will now be sampled according to the configuration
const response = await agent.generate('Hello, how are you?');
```

### Manual Evaluation with Sampling

The `evaluate` function also respects sampling configuration:

```typescript
import { evaluate, configureSampling } from '@mastra/evals';
import { FaithfulnessMetric } from '@mastra/evals/llm';

configureSampling({
  strategy: { type: 'count', every: 5 }
});

const metric = new FaithfulnessMetric();

// This will be sampled according to the configuration
const result = await evaluate(agent, "What is the capital of France?", metric);

if (result.skipped) {
  console.log('Evaluation was skipped due to sampling');
} else {
  console.log('Evaluation result:', result);
}
```

### Sampling Statistics

You can get statistics about sampling behavior:

```typescript
import { getSampler } from '@mastra/evals';

const sampler = getSampler();
if (sampler) {
  const stats = sampler.getStats('my-agent');
  console.log(`Total requests: ${stats.totalRequests}`);
  console.log(`Last sample time: ${stats.lastSampleTime}`);
}
```

### Resetting Sampling State

You can reset sampling counters and state:

```typescript
import { getSampler } from '@mastra/evals';

const sampler = getSampler();
if (sampler) {
  // Reset for specific agent
  sampler.reset('my-agent');
  
  // Reset for all agents
  sampler.reset();
}
```

## Basic Usage

### Setting up evaluations

```typescript
import { attachListeners } from '@mastra/evals';

await attachListeners();
```

### Using with Mastra

```typescript
import { attachListeners } from '@mastra/evals';

await attachListeners(mastra);
```

## Metrics

### LLM-based Metrics

```typescript
import { SummarizationMetric } from '@mastra/evals/llm';

const metric = new SummarizationMetric();
const result = await metric.measure(input, output);
```

### NLP-based Metrics

```typescript
import { ContentSimilarityMetric, ToneConsistencyMetric } from '@mastra/evals/nlp';

const similarityMetric = new ContentSimilarityMetric();
const toneMetric = new ToneConsistencyMetric();
```

## Running Evaluations

### Manual Evaluation

```typescript
import { evaluate } from '@mastra/evals';
import { ContentSimilarityMetric } from '@mastra/evals/nlp';

const metric = new ContentSimilarityMetric();
const result = await evaluate(myAgent, "Hello, world!", metric);
```

### Global Setup for Testing

```typescript
import { globalSetup } from '@mastra/evals';

await globalSetup();
```

### Attaching Listeners

```typescript
import { attachListeners } from '@mastra/evals';

await attachListeners();
// or with mastra instance
await attachListeners(mastra);
```

## Advanced Usage

### Custom Evaluation Metrics

```typescript
import { MastraAgentJudge } from "@mastra/evals/judge";

const judge = new MastraAgentJudge({
  model: openai('gpt-4'),
  instructions: "Evaluate the response quality on a scale of 1-10"
});

const result = await judge.measure(input, output);
```

## Environment Variables

Required for LLM-based metrics:

- `OPENAI_API_KEY`: For OpenAI model access
- Additional provider keys as needed (Cohere, Anthropic, etc.)

## Package Exports

```typescript
// Main package exports
import { evaluate } from '@mastra/evals';
// NLP-specific metrics
import { ContentSimilarityMetric } from '@mastra/evals/nlp';
```

## Related Packages

- `@mastra/core`: Core framework functionality
- `@mastra/engine`: LLM execution engine
- `@mastra/mcp`: Model Context Protocol integration
