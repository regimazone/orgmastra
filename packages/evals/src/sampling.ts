export type SamplingStrategy = 
  | { type: 'none' } // No sampling, evaluate everything
  | { type: 'ratio'; probability: number } // Random sampling with probability (0-1)
  | { type: 'count'; every: number } // Sample every Nth request
  | { type: 'time'; intervalMs: number } // Sample based on time intervals

export interface SamplingConfig {
  strategy: SamplingStrategy;
  /** Optional function to determine if a specific request should be sampled */
  shouldSample?: (context: { agentName: string; runId: string; input: string }) => boolean;
}

export class Sampler {
  private strategy: SamplingStrategy;
  private shouldSampleFn?: SamplingConfig['shouldSample'];
  private counters = new Map<string, number>();
  private lastSampleTimes = new Map<string, number>();

  constructor(config: SamplingConfig) {
    this.strategy = config.strategy;
    this.shouldSampleFn = config.shouldSample;
  }

  shouldSample(context: { agentName: string; runId: string; input: string }): boolean {
    // First check custom shouldSample function if provided
    if (this.shouldSampleFn) {
      const customResult = this.shouldSampleFn(context);
      if (!customResult) {
        return false;
      }
    }

    switch (this.strategy.type) {
      case 'none':
        return true;

      case 'ratio':
        return Math.random() < this.strategy.probability;

      case 'count': {
        const key = context.agentName;
        const currentCount = this.counters.get(key) || 0;
        this.counters.set(key, currentCount + 1);
        return (currentCount + 1) % this.strategy.every === 0;
      }

      case 'time': {
        const key = context.agentName;
        const now = Date.now();
        const lastSample = this.lastSampleTimes.get(key) || 0;
        
        if (now - lastSample >= this.strategy.intervalMs) {
          this.lastSampleTimes.set(key, now);
          return true;
        }
        return false;
      }

      default:
        return true;
    }
  }

  reset(agentName?: string): void {
    if (agentName) {
      this.counters.delete(agentName);
      this.lastSampleTimes.delete(agentName);
    } else {
      this.counters.clear();
      this.lastSampleTimes.clear();
    }
  }

  getStats(agentName: string): { totalRequests: number; lastSampleTime?: number } {
    return {
      totalRequests: this.counters.get(agentName) || 0,
      lastSampleTime: this.lastSampleTimes.get(agentName),
    };
  }
}

// Global sampler instance
let globalSampler: Sampler | null = null;

export function configureSampling(config: SamplingConfig): void {
  globalSampler = new Sampler(config);
}

export function getSampler(): Sampler | null {
  return globalSampler;
}

export function clearSampling(): void {
  globalSampler = null;
}