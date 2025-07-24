import { DefaultExecutionEngine } from '@mastra/core/workflows';
import type { Mastra } from '@mastra/core';

// Methods that should be intercepted and forwarded to Cloudflare Workflows
const INTERCEPTED_METHODS = [
  'execute',
  // 'executeStep',
  // 'executeParallel',
  // 'executeConditional',
  // 'executeLoop',
  // 'executeForeach',
  // 'executeSleep',
  // 'executeSleepUntil',
  // 'executeWaitForEvent',
  // 'executeEntry',
  // 'persistStepUpdate',
] as const;

export class CloudflareWorkflowsExecutionEngine extends DefaultExecutionEngine {
  private workerUrl: string;

  constructor({ workerUrl }: { workerUrl: string }) {
    super({});
    if (!workerUrl) {
      throw new Error('workerUrl is required for CloudflareWorkflowsExecutionEngine');
    }
    this.workerUrl = workerUrl;
    this.name = 'CloudflareWorkflowsExecutionEngine';

    // Create a proxy to intercept method calls
    return new Proxy(this, {
      get(target, prop, receiver) {
        const originalValue = Reflect.get(target, prop, receiver);

        // Only intercept the specified execution methods
        if (typeof prop === 'string' && INTERCEPTED_METHODS.includes(prop as any)) {
          return async (...args: any[]) => {
            if (!target.isRunningInCloudflareWorkflows()) {
              console.log(`Forwarding ${prop} to Cloudflare Workflow with args:`, args);
              return target.forwardToCloudflareWorkflow(prop, args);
            }
            // If running in Cloudflare Workflows, call the original method from the DefaultExecutionEngine
            return originalValue.apply(target, args);
          };
        }

        return originalValue;
      },
    });
  }

  private isRunningInCloudflareWorkflows(): boolean {
    const isRunningInCloudflareWorkflows = process.env.MASTRA_WORKFLOW_EXECUTION_CONTEXT === 'cloudflare-workflows';
    console.log(`isRunningInCloudflareWorkflows: ${isRunningInCloudflareWorkflows.toString()}`);
    return isRunningInCloudflareWorkflows;
  }

  private async forwardToCloudflareWorkflow(methodName: string, args: any[]): Promise<any> {
    try {
      const response = await fetch(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: methodName,
          args: args,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    } catch (error) {
      throw new Error(
        `Failed to forward ${methodName} to Cloudflare Workflow at ${this.workerUrl}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
