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
    // Run the Mastra workflow inside this Cloudflare Workflow step
    const result = await step.do(
      `execute-mastra-workflow-${event.payload.workflowId}`,
      {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 minutes',
      },
      async () => {
        const { workflowId, runId, input, resume } = event.payload;

        console.log(`Executing Mastra workflow: ${workflowId}, run: ${runId}${resume ? ' (resuming)' : ''}`);

        // Get the workflow
        const workflow = this.mastra.getWorkflow(workflowId);
        if (!workflow) {
          throw new Error(`Workflow not found: ${workflowId}`);
        }

        // Create a workflow run
        const run = await workflow.createRunAsync({ runId });

        if (resume) {
          // For resume, we need to implement resume functionality
          // For now, let's just start fresh (this is a limitation we can address later)
          console.warn('Resume functionality not yet implemented, starting fresh');
        }

        // Execute the workflow
        const result = await run.start({ inputData: input });
        return result;
      },
    );

    return result;
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

/**
 * Creates a fetch handler for triggering Mastra workflows via HTTP
 * @param workflowBinding - The Cloudflare Workflow binding
 * @returns A fetch handler function
 */
export function createMastraFetchHandler(workflowBinding: any) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const workflowId = url.searchParams.get('workflowId');
    const runId = url.searchParams.get('runId') || crypto.randomUUID();

    // Require workflowId to be specified
    if (!workflowId) {
      return Response.json(
        {
          error: 'workflowId parameter is required',
          example: '?workflowId=simpleWorkflow',
        },
        { status: 400 },
      );
    }

    // Parse input and resume data from query params or request body
    let input: any = {};
    let resume: any = undefined;

    if (req.method === 'POST') {
      try {
        const body = (await req.json()) as any;
        input = body.input || input;
        resume = body.resume;
      } catch (error) {
        return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
      }
    } else {
      // Parse from query params
      const inputParam = url.searchParams.get('input');
      const resumeParam = url.searchParams.get('resume');

      if (inputParam) {
        try {
          input = JSON.parse(inputParam);
        } catch {
          return Response.json({ error: 'Invalid JSON in input parameter' }, { status: 400 });
        }
      }

      if (resumeParam) {
        try {
          resume = JSON.parse(resumeParam);
        } catch {
          return Response.json({ error: 'Invalid JSON in resume parameter' }, { status: 400 });
        }
      }
    }

    try {
      // Create cloudflare workflow instance
      const instance = await workflowBinding.create({
        id: runId,
        params: {
          workflowId,
          runId,
          input,
          resume,
        },
      });

      return Response.json({
        success: true,
        workflowId,
        runId,
        instanceId: instance.id,
        message: resume ? 'Workflow resumed successfully' : 'Workflow started successfully',
        input,
        resume,
      });
    } catch (error) {
      console.error('Error starting workflow:', error);
      return Response.json(
        {
          error: 'Failed to start workflow',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  };
}
