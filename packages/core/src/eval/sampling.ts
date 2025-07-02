import type { CoreMessage } from 'ai';
import type { RuntimeContext } from '../runtime-context';

export type SamplingStrategy =
  | { type: 'none' }
  | { type: 'ratio'; probability: number }
  | { type: 'count'; every: number }
  | { type: 'time'; intervalms: number };

export type SamplingConfig = {
  strategy: SamplingStrategy;
  shouldSample?: ({
    runtimeContext,
    input,
    runId,
    resourceId,
    threadId,
  }: {
    runtimeContext: RuntimeContext;
    input: CoreMessage[];
    runId: string;
    resourceId?: string;
    threadId?: string;
  }) => boolean;
};
