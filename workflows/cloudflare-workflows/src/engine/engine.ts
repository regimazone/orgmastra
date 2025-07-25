import { DefaultExecutionEngine } from '@mastra/core/workflows';
import type { Mastra } from '@mastra/core';

export class CloudflareWorkflowsExecutionEngine extends DefaultExecutionEngine {
  private workerUrl: string;

  constructor({ workerUrl }: { workerUrl: string }) {
    super({});
    if (!workerUrl) {
      throw new Error('workerUrl is required for CloudflareWorkflowsExecutionEngine');
    }
    this.workerUrl = workerUrl;
    this.name = 'CloudflareWorkflowsExecutionEngine';
  }

  private isRunningInCloudflareWorkflows(): boolean {
    return process.env.MASTRA_WORKFLOW_EXECUTION_CONTEXT === 'cloudflare-workflows';
  }

  async execute(params: any) {
    if (!this.isRunningInCloudflareWorkflows()) {
      const serializedParams = {
        workflowId: params.workflowId,
        runId: params.runId,
        input: params.input,
        resume: params.resume,
        retryConfig: params.retryConfig,
        runtimeContextData: params.runtimeContext ? this.serializeRuntimeContext(params.runtimeContext) : {},
        graph: params.graph,
        serializedStepGraph: params.serializedStepGraph,
      };

      const response = await fetch(`${this.workerUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(serializedParams),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const instanceRes = await response.json();
      if (instanceRes.error) {
        throw new Error(instanceRes.error);
      }

      // TODO: Need a better way to handle long running workflows.
      // The current mastra apis are async/await and return the final result of the workflow,
      // but the workflow could run for hours.
      // If this was called from a serverless function, it would timeout even though the workflow is still running.

      // This is a temporary solution until we have a better way to handle long running workflows.
      // keep polling fetches to /instance/status/:instanceId
      const getStatus = async () => {
        console.log(`Getting status for cloudflare workflow instance ${instanceRes.instanceId}`);
        const statusRes = await fetch(`${this.workerUrl}/instance/status/${instanceRes.instanceId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        if (!statusRes.ok) {
          throw new Error(`HTTP ${statusRes.status}: ${statusRes.statusText}`);
        }
        return statusRes.json();
      };

      let status = await getStatus();
      while (status.status !== 'complete') {
        await new Promise(res => setTimeout(res, 500));
        status = await getStatus();
      }

      return status.output;
    }

    // If running in Cloudflare Workflows, call the original method from the DefaultExecutionEngine
    return super.execute(params);
  }

  private serializeRuntimeContext(runtimeContext: any): Record<string, any> {
    const data: Record<string, any> = {};
    // RuntimeContext has a registry Map, extract its contents
    if (runtimeContext.registry && runtimeContext.registry instanceof Map) {
      for (const [key, value] of runtimeContext.registry.entries()) {
        try {
          // Only include serializable values
          JSON.stringify(value);
          data[key] = value;
        } catch {
          // Skip non-serializable values
          console.warn(`Skipping non-serializable runtime context value for key: ${key}`);
        }
      }
    }
    return data;
  }
}
