import EventEmitter from 'events';
import type { Emitter, ExecuteFunction, Mastra, Step, StepFlowEntry, StepResult } from '../..';
import type { RuntimeContext } from '../../di';
import type { PubSub } from '../../events';
import { EMITTER_SYMBOL } from '../constants';
import { StepExecutor } from './step-executor';

export class StepExecutorHttp extends StepExecutor {
  constructor({ mastra }: { mastra?: Mastra }) {
    super({ mastra });
  }

  async execute(params: {
    workflowId: string;
    step: Step<any, any, any, any>;
    runId: string;
    input?: any;
    resumeData?: any;
    stepResults: Record<string, StepResult<any, any, any, any>>;
    emitter: EventEmitter;
    runtimeContext: RuntimeContext;
    runCount?: number;
    foreachIdx?: number;
  }): Promise<StepResult<any, any, any, any>> {
    const res = await fetch(
      `http://localhost:3000/api/workflows/${params.workflowId}/runs/${params.runId}/execute-step`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to execute step: ${res.statusText}`);
    }

    return res.json();
  }
  // TODO: implement rest of the methods

  async evaluateConditions(params: {
    workflowId: string;
    step: Extract<StepFlowEntry, { type: 'conditional' }>;
    runId: string;
    input?: any;
    resumeData?: any;
    stepResults: Record<string, StepResult<any, any, any, any>>;
    emitter: { runtime: PubSub; events: PubSub };
    runtimeContext: RuntimeContext;
    runCount?: number;
  }): Promise<number[]> {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;

    const abortController = new AbortController();
    const ee = new EventEmitter();

    const results = await Promise.all(
      step.conditions.map(condition => {
        try {
          return this.evaluateCondition({
            workflowId: params.workflowId,
            condition,
            runId,
            runtimeContext,
            inputData: params.input,
            runCount,
            resumeData: params.resumeData,
            abortController,
            stepResults,
            emitter: ee,
          });
        } catch (e) {
          console.error('error evaluating condition', e);
          return false;
        }
      }),
    );

    const idxs = results.reduce((acc, result, idx) => {
      if (result) {
        acc.push(idx);
      }

      return acc;
    }, [] as number[]);

    return idxs;
  }

  async evaluateCondition({
    workflowId,
    condition,
    runId,
    inputData,
    resumeData,
    stepResults,
    runtimeContext,
    emitter,
    abortController,
    runCount = 0,
  }: {
    workflowId: string;
    condition: ExecuteFunction<any, any, any, any, any>;
    runId: string;
    inputData?: any;
    resumeData?: any;
    stepResults: Record<string, StepResult<any, any, any, any>>;
    emitter: EventEmitter;
    runtimeContext: RuntimeContext;
    abortController: AbortController;
    runCount?: number;
  }): Promise<boolean> {
    return condition({
      workflowId,
      runId,
      mastra: this.mastra!,
      runtimeContext,
      inputData,
      runCount,
      resumeData: resumeData,
      getInitData: () => stepResults?.input as any,
      getStepResult: (step: any) => {
        if (!step?.id) {
          return null;
        }

        const result = stepResults[step.id];
        if (result?.status === 'success') {
          return result.output;
        }

        return null;
      },
      suspend: async (_suspendPayload: any): Promise<any> => {
        throw new Error('Not implemented');
      },
      bail: (_result: any) => {
        throw new Error('Not implemented');
      },
      // TODO
      writer: undefined as any,
      abort: () => {
        abortController?.abort();
      },
      [EMITTER_SYMBOL]: emitter as unknown as Emitter, // TODO: refactor this to use our PubSub actually
      engine: {},
      abortSignal: abortController?.signal,
      // TODO
      tracingContext: {},
    });
  }

  async resolveSleep(params: {
    workflowId: string;
    step: Extract<StepFlowEntry, { type: 'sleep' }>;
    runId: string;
    input?: any;
    resumeData?: any;
    stepResults: Record<string, StepResult<any, any, any, any>>;
    emitter: { runtime: PubSub; events: PubSub };
    runtimeContext: RuntimeContext;
    runCount?: number;
  }): Promise<number> {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;

    const abortController = new AbortController();
    const ee = new EventEmitter();

    if (step.duration) {
      return step.duration;
    }

    if (!step.fn) {
      return 0;
    }

    try {
      return await step.fn({
        workflowId: params.workflowId,
        runId,
        mastra: this.mastra!,
        runtimeContext,
        inputData: params.input,
        runCount,
        resumeData: params.resumeData,
        getInitData: () => stepResults?.input as any,
        getStepResult: (step: any) => {
          if (!step?.id) {
            return null;
          }

          const result = stepResults[step.id];
          if (result?.status === 'success') {
            return result.output;
          }

          return null;
        },
        suspend: async (_suspendPayload: any): Promise<any> => {
          throw new Error('Not implemented');
        },
        bail: (_result: any) => {
          throw new Error('Not implemented');
        },
        abort: () => {
          abortController?.abort();
        },
        // TODO
        writer: undefined as any,
        [EMITTER_SYMBOL]: ee as unknown as Emitter, // TODO: refactor this to use our PubSub actually
        engine: {},
        abortSignal: abortController?.signal,
        // TODO
        tracingContext: {},
      });
    } catch (e) {
      console.error('error evaluating condition', e);
      return 0;
    }
  }

  async resolveSleepUntil(params: {
    workflowId: string;
    step: Extract<StepFlowEntry, { type: 'sleepUntil' }>;
    runId: string;
    input?: any;
    resumeData?: any;
    stepResults: Record<string, StepResult<any, any, any, any>>;
    emitter: { runtime: PubSub; events: PubSub };
    runtimeContext: RuntimeContext;
    runCount?: number;
  }): Promise<number> {
    const { step, stepResults, runId, runtimeContext, runCount = 0 } = params;

    const abortController = new AbortController();
    const ee = new EventEmitter();

    if (step.date) {
      return step.date.getTime() - Date.now();
    }

    if (!step.fn) {
      return 0;
    }

    try {
      const result = await step.fn({
        workflowId: params.workflowId,
        runId,
        mastra: this.mastra!,
        runtimeContext,
        inputData: params.input,
        runCount,
        resumeData: params.resumeData,
        getInitData: () => stepResults?.input as any,
        getStepResult: (step: any) => {
          if (!step?.id) {
            return null;
          }

          const result = stepResults[step.id];
          if (result?.status === 'success') {
            return result.output;
          }

          return null;
        },
        suspend: async (_suspendPayload: any): Promise<any> => {
          throw new Error('Not implemented');
        },
        bail: (_result: any) => {
          throw new Error('Not implemented');
        },
        abort: () => {
          abortController?.abort();
        },
        // TODO
        writer: undefined as any,
        [EMITTER_SYMBOL]: ee as unknown as Emitter, // TODO: refactor this to use our PubSub actually
        engine: {},
        abortSignal: abortController?.signal,
        // TODO
        tracingContext: {},
      });

      return result.getTime() - Date.now();
    } catch (e) {
      console.error('error evaluating condition', e);
      return 0;
    }
  }
}
