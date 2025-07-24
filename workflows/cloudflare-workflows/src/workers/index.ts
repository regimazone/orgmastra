import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import type { Mastra } from '@mastra/core';

// Types for Cloudflare Workflows
export interface WorkflowEnv {
  [key: string]: any;
}

export interface MastraWorkflowParams {
  workflowId: string;
  runId: string;
  input: any;
  resume?: any;
}

/**
 * Base class for Mastra Cloudflare Workflows
 */
class MastraCloudflareWorkflowBase extends WorkflowEntrypoint<WorkflowEnv, MastraWorkflowParams> {
  constructor(
    ctx: any,
    env: WorkflowEnv,
    private mastra: Mastra,
  ) {
    super(ctx, env);
  }

  async run(event: WorkflowEvent<MastraWorkflowParams>, step: WorkflowStep) {
    // Set the execution context to indicate we're in a Cloudflare Workflow instance
    process.env.MASTRA_WORKFLOW_EXECUTION_CONTEXT = 'cloudflare-workflows';

    const { method, params } = event.payload;
    console.log(`Executing method: ${method}, params: ${params}`);

    if (method === 'execute') {
      const result = await step.do(
        `execute:${params.runId}`,
        {
          retries: {
            limit: params?.retryConfig?.attempts ?? 3,
            delay: params?.retryConfig?.delay !== undefined ? params.retryConfig.delay : '1 seconds',
            backoff: 'exponential',
          },
          timeout: '30 minutes',
        },
        async () => {
          const workflow = this.mastra.getWorkflowById(params.workflowId);
          if (!workflow) {
            throw new Error(`Workflow not found: ${params.workflowId}`);
          }
          console.log(`workflow`, workflow);

          const run = await workflow.createRunAsync({ runId: params.runId });

          // Recreate the complex objects for CF context
          const { RuntimeContext } = await import('@mastra/core/runtime-context');
          // const { EventEmitter } = await import('events');

          const runtimeContext = new RuntimeContext();
          if (params.runtimeContextData) {
            for (const [key, value] of Object.entries(params.runtimeContextData)) {
              runtimeContext.set(key, value);
            }
          }

          // Execute using the run's start method instead of the engine directly
          if (params.resume) {
            return await run.resume({
              resumeData: params.resume,
              step: params.resume.steps,
              runtimeContext,
            });
          } else {
            return await run.start({
              inputData: params.input,
              runtimeContext,
            });
          }
        },
      );
      console.log('result222', result);

      return result;
    }

    throw new Error(`Method ${method} not found`);
  }
}

/**
 * Creates a Cloudflare Workflow class that can execute Mastra workflows
 * @param mastra - The Mastra instance with your workflows
 * @returns A Cloudflare Workflow class
 */
export function createMastraCloudflareWorkflow(mastra: Mastra) {
  return class extends MastraCloudflareWorkflowBase {
    constructor(ctx: any, env: WorkflowEnv) {
      super(ctx, env, mastra);
    }
  };
}

export { createMastraFetchHandler } from './serve';
