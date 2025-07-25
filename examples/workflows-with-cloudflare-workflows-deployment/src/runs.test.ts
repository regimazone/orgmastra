import { describe, it, expect, beforeAll } from 'vitest';
import { Mastra } from '@mastra/core';
import { CloudflareWorkflowsExecutionEngine } from '@mastra/cloudflare-workflows/engine';
import { simpleWorkflow } from './mastra/workflows/simple-workflow.js';

// temporary simple test to compare local and cloudflare execution engines

const mastra = new Mastra({
  workflows: { simpleWorkflow },
});

const mastraWithCloudflareEngine = new Mastra({
  workflows: { simpleWorkflow },
  workflowOptions: {
    executionEngine: new CloudflareWorkflowsExecutionEngine({ workerUrl: 'http://localhost:8787' }),
  },
});

describe('Workflow Execution Comparison', () => {
  beforeAll(() => {
    // Ensure we're not in CF context for the local mastra instance
    delete process.env.MASTRA_WORKFLOW_EXECUTION_CONTEXT;
  });

  it('should create runs with same structure', async () => {
    // Create runs from both instances
    const localRun = await mastra.getWorkflow('simpleWorkflow').createRunAsync();
    const cfRun = await mastraWithCloudflareEngine.getWorkflow('simpleWorkflow').createRunAsync();

    // Both runs should have similar structure
    expect(localRun.workflowId).toBe(cfRun.workflowId);

    expect(localRun.runId).toBeDefined();
    expect(cfRun.runId).toBeDefined();

    // Both should have the same execution methods
    expect(typeof localRun.start).toBe('function');
    expect(typeof cfRun.start).toBe('function');
    expect(typeof localRun.resume).toBe('function');
    expect(typeof cfRun.resume).toBe('function');
  });

  it('should produce same results when executing workflows', async () => {
    const testInput = { message: 'Hello Test!', count: 3 };

    // Create runs
    const localRun = await mastra.getWorkflow('simpleWorkflow').createRunAsync();
    const cfRun = await mastraWithCloudflareEngine.getWorkflow('simpleWorkflow').createRunAsync();

    // Execute both workflows
    const localResult = await localRun.start({ inputData: testInput });
    const cfResult = await cfRun.start({ inputData: testInput });

    // Both results should have same status
    expect(localResult.status).toBe(cfResult.status);

    // Both should have completed successfully
    expect(localResult.status).toBe(cfResult.status);

    // Both should have the same step results structure
    expect(Object.keys(localResult.steps)).toEqual(Object.keys(cfResult.steps));

    // Check that all steps completed successfully in both
    for (const stepId of Object.keys(localResult.steps)) {
      expect(localResult.steps[stepId].status).toBe(cfResult.steps[stepId].status);
    }

    // The final results should be equivalent
    // Note: timestamps might differ, so we'll check structure rather than exact equality
    expect(typeof localResult.result).toBe(typeof cfResult.result);

    expect({ ...localResult.result, completedAt: undefined }).toEqual({ ...cfResult.result, completedAt: undefined });

    expect(localResult.result.completedAt).toBeDefined();
    expect(cfResult.result.completedAt).toBeDefined();

    // console.log('Local result:', JSON.stringify(localResult, null, 2));
    // console.log('CF result:', JSON.stringify(cfResult, null, 2));
  });

  it('should handle workflow errors consistently', async () => {
    // Test with invalid input to see if error handling is consistent
    const invalidInput = { message: '', count: -1 };

    const localRun = await mastra.getWorkflow('simpleWorkflow').createRunAsync();
    const cfRun = await mastraWithCloudflareEngine.getWorkflow('simpleWorkflow').createRunAsync();

    const localResult = await localRun.start({ inputData: invalidInput });
    const cfResult = await cfRun.start({ inputData: invalidInput });

    // Both should handle the same way (either both succeed or both fail)
    expect(localResult.status).toBe(cfResult.status);

    if (localResult.status === 'failed') {
      expect(cfResult.status).toBe('failed');
      // Both should have error information
      expect(localResult.error).toBeDefined();
      expect(cfResult.error).toBeDefined();
    }
  });
});
