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
    // Set the execution context to indicate we're in Cloudflare Workflows
    process.env.MASTRA_WORKFLOW_EXECUTION_CONTEXT = 'cloudflare-workflows';

    // Check if this is a method execution request
    if ((event.payload as any).type === 'method-execution') {
      return await this.handleMethodExecution(event.payload as any, step);
    }

    // Otherwise, handle as regular workflow execution
    return await this.handleWorkflowExecution(event.payload, step);
  }

  private async handleMethodExecution(payload: { method: string; args: any[]; runId: string }, step: WorkflowStep) {
    const { method, args, runId } = payload;

    const result = await step.do(
      `execute-method-${method}-${runId}`,
      {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 minutes',
      },
      async () => {
        console.log(`Executing method: ${method}`);

        // Create a DefaultExecutionEngine for this context since we're inside CF Workflows
        const { DefaultExecutionEngine } = await import('@mastra/core/workflows');
        const engine = new DefaultExecutionEngine({ mastra: this.mastra });

        // Check if the method exists on the engine
        if (typeof (engine as any)[method] !== 'function') {
          throw new Error(`Method ${method} not found on execution engine`);
        }

        // Execute the method with the provided arguments
        const result = await (engine as any)[method](...args);
        console.log('engine method result', result);
        return result;
      },
    );

    return result;
  }

  private async handleWorkflowExecution(payload: MastraWorkflowParams, step: WorkflowStep) {
    const result = await step.do(
      `execute-mastra-workflow-${payload.workflowId}`,
      {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 minutes',
      },
      async () => {
        const { workflowId, runId, input, resume } = payload;

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
 * Creates a fetch handler for both triggering Mastra workflows via HTTP and handling method forwarding
 * @param workflowBinding - The Cloudflare Workflow binding
 * @param mastra - The Mastra instance for direct method execution
 * @returns A fetch handler function
 */
export function createMastraFetchHandler(workflowBinding: any, mastra: Mastra) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    // Handle POST requests for method forwarding
    if (req.method === 'POST') {
      try {
        const body = (await req.json()) as any;

        // Check if this is a method forwarding request
        if (body.method && body.args) {
          return await handleMethodForwarding(body, workflowBinding, mastra);
        }

        // Otherwise, treat as workflow trigger with POST body
        return await handleWorkflowTrigger(url, body, workflowBinding);
      } catch (error) {
        return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
      }
    }

    // Handle GET requests for workflow triggering
    return await handleWorkflowTrigger(url, {}, workflowBinding);
  };
}

/**
 * Handles method forwarding requests from CloudflareWorkflowsExecutionEngine
 * Creates a Cloudflare Workflow instance to execute the method with proper durability
 */
async function handleMethodForwarding(
  body: { method: string; args: any[] },
  workflowBinding: any,
  mastra: Mastra,
): Promise<Response> {
  const { method, args } = body;

  try {
    // Generate a unique run ID for this method execution
    const runId = crypto.randomUUID();

    // Create a Cloudflare Workflow instance specifically for method execution
    const instance = await workflowBinding.create({
      id: runId,
      params: {
        type: 'method-execution',
        method,
        args,
        runId,
      },
    });

    // Return immediately with instance info
    // The actual execution happens asynchronously in the workflow
    return Response.json({
      success: true,
      instanceId: instance.id,
      runId,
      message: 'Method execution started',
    });
  } catch (error) {
    console.error(`Error executing method ${method}:`, error);
    return Response.json(
      {
        error: `Failed to execute method ${method}`,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * Handles workflow triggering requests
 */
async function handleWorkflowTrigger(url: URL, body: any, workflowBinding: any): Promise<Response> {
  const workflowId = url.searchParams.get('workflowId') || body.workflowId;
  const runId = url.searchParams.get('runId') || body.runId || crypto.randomUUID();

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
  let input: any = body.input || {};
  let resume: any = body.resume;

  // Parse from query params if not in body
  if (!body.input) {
    const inputParam = url.searchParams.get('input');
    if (inputParam) {
      try {
        input = JSON.parse(inputParam);
      } catch {
        return Response.json({ error: 'Invalid JSON in input parameter' }, { status: 400 });
      }
    }
  }

  if (!body.resume) {
    const resumeParam = url.searchParams.get('resume');
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
}
