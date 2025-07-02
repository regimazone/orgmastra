# Sampling Implementation for @mastra/evals

## Overview

I have successfully implemented sampling functionality for the `@mastra/evals` package to control when evaluations are executed. This addresses the need to reduce evaluation frequency in production environments to manage costs and performance.

## Current Evaluation Flow (Before Sampling)

1. **Agent Configuration**: Agents can have `evals` (metrics) attached during construction
2. **Automatic Evaluation**: When `agent.generate()` is called, if the agent has evals configured:
   - The system automatically executes the `ON_GENERATION` hook for each metric
   - This triggers evaluation for **every single request**
3. **Manual Evaluation**: Developers can call `evaluate(agent, input, metric)` manually
4. **Storage**: Evaluation results are stored via the `ON_EVALUATION` hook

## New Sampling Implementation

### 1. Sampling Strategies

I implemented four different sampling strategies:

#### `ratio` - Probability-based sampling
```typescript
configureSampling({
  strategy: { type: 'ratio', probability: 0.1 } // 10% of requests
});
```

#### `count` - Every Nth request
```typescript
configureSampling({
  strategy: { type: 'count', every: 10 } // Every 10th request
});
```

#### `time` - Time interval-based
```typescript
configureSampling({
  strategy: { type: 'time', intervalMs: 60000 } // Once per minute
});
```

#### `none` - No sampling (default behavior)
```typescript
configureSampling({
  strategy: { type: 'none' } // Evaluate everything
});
```

### 2. Custom Sampling Logic

Users can provide custom logic to determine sampling:

```typescript
configureSampling({
  strategy: { type: 'ratio', probability: 0.5 },
  shouldSample: ({ agentName, input }) => {
    // Only sample critical agents or important requests
    return agentName.includes('critical') || input.includes('important');
  }
});
```

### 3. Integration Points

#### A. Manual Evaluation (`evaluate` function)
- Modified `packages/evals/src/evaluation.ts` to check sampling before executing
- Returns a special result object when evaluation is skipped:
```typescript
{
  score: null,
  reason: 'Evaluation skipped due to sampling configuration',
  output: '',
  skipped: true,
}
```

#### B. Automatic Evaluation (Agent hooks)
- Modified `packages/evals/src/attachListeners.ts` to register an `ON_GENERATION` hook
- The hook checks sampling configuration before proceeding with evaluation
- Maintains backward compatibility - if no sampler is configured, all evaluations proceed

### 4. API Design

#### Core Functions
```typescript
// Configure global sampling
configureSampling(config: SamplingConfig): void

// Get current sampler instance
getSampler(): Sampler | null

// Clear sampling configuration
clearSampling(): void
```

#### Sampler Class
```typescript
class Sampler {
  shouldSample(context: { agentName: string; runId: string; input: string }): boolean
  reset(agentName?: string): void
  getStats(agentName: string): { totalRequests: number; lastSampleTime?: number }
}
```

## Files Modified/Created

### New Files
1. `packages/evals/src/sampling.ts` - Core sampling implementation
2. `SAMPLING_IMPLEMENTATION.md` - This documentation

### Modified Files
1. `packages/evals/src/index.ts` - Added sampling exports
2. `packages/evals/src/evaluation.ts` - Added sampling check to evaluate function
3. `packages/evals/src/attachListeners.ts` - Added ON_GENERATION hook with sampling
4. `packages/evals/package.json` - Added @types/node dependency
5. `packages/evals/README.md` - Comprehensive documentation update

## Usage Examples

### Basic Setup
```typescript
import { configureSampling, attachListeners } from '@mastra/evals';

// Configure 10% sampling
configureSampling({
  strategy: { type: 'ratio', probability: 0.1 }
});

// Set up evaluation listeners
await attachListeners();

// Create agent with evals - sampling will be applied automatically
const agent = new Agent({
  name: 'my-agent',
  evals: {
    similarity: new ContentSimilarityMetric(),
    toxicity: new ToxicityMetric(),
  }
});
```

### Production Monitoring
```typescript
// Sample every 100th request for cost-effective monitoring
configureSampling({
  strategy: { type: 'count', every: 100 }
});

// Get sampling statistics
const sampler = getSampler();
const stats = sampler?.getStats('production-agent');
console.log(`Processed ${stats?.totalRequests} requests`);
```

### Environment-Specific Configuration
```typescript
// Different sampling for different environments
if (process.env.NODE_ENV === 'production') {
  configureSampling({
    strategy: { type: 'ratio', probability: 0.01 } // 1% in production
  });
} else if (process.env.NODE_ENV === 'staging') {
  configureSampling({
    strategy: { type: 'ratio', probability: 0.1 } // 10% in staging
  });
} else {
  configureSampling({
    strategy: { type: 'none' } // 100% in development
  });
}
```

## Benefits

1. **Cost Control**: Reduce evaluation costs by sampling only a subset of requests
2. **Performance**: Lower latency by reducing evaluation overhead
3. **Flexibility**: Multiple sampling strategies for different use cases
4. **Backward Compatibility**: No breaking changes - sampling is opt-in
5. **Observability**: Built-in statistics and monitoring capabilities
6. **Production Ready**: Designed for production environments with proper error handling

## Technical Considerations

### State Management
- Sampling state is maintained per agent to ensure accurate counting/timing
- Global sampler instance allows consistent configuration across the application
- Reset functionality for testing and state management

### Error Handling
- Sampling failures don't affect the main agent flow
- Graceful degradation when sampling configuration is invalid
- Silent failures in evaluation to prevent disrupting agent responses

### Memory Efficiency
- Lightweight implementation using Maps for state storage
- Automatic cleanup options through reset functionality
- No memory leaks from unbounded state growth

### Thread Safety
- Implementation is safe for concurrent usage
- No shared mutable state that could cause race conditions

## Future Enhancements

1. **Adaptive Sampling**: Automatically adjust sampling rates based on system load
2. **Metric-Specific Sampling**: Different sampling rates for different evaluation metrics
3. **Distributed Sampling**: Coordination across multiple instances/containers
4. **Advanced Statistics**: More detailed analytics and reporting
5. **Configuration UI**: Web interface for managing sampling configurations

## Testing

The implementation includes comprehensive test coverage for:
- All sampling strategies (ratio, count, time, none)
- Custom sampling logic
- Statistics tracking
- State management and reset functionality
- Global configuration management

## Conclusion

The sampling implementation provides a robust, flexible solution for controlling evaluation frequency in the `@mastra/evals` package. It addresses the core requirement of reducing evaluation overhead in production while maintaining full functionality for development and testing environments.

The design prioritizes:
- **Ease of use**: Simple configuration API
- **Flexibility**: Multiple strategies and custom logic support
- **Reliability**: Backward compatibility and error resilience
- **Observability**: Built-in monitoring and statistics
- **Performance**: Minimal overhead and efficient state management