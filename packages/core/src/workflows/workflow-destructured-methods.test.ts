import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Mastra } from '../mastra';
import { createWorkflow, createStep } from './index';

describe('Workflow Execution Engine Bug', () => {
  it('should allow destructred start method', async () => {
    // Create a simple workflow
    const stepOne = createStep({
      id: 'stepOne',
      description: 'Doubles the input',
      inputSchema: z.object({
        input: z.number(),
      }),
      outputSchema: z.object({
        doubled: z.number(),
      }),
      execute: async ({ inputData }) => {
        return { doubled: inputData.input * 2 };
      },
    });

    const stepTwo = createStep({
      id: 'stepTwo',
      description: 'Adds 10 to the doubled value',
      inputSchema: z.object({
        doubled: z.number(),
      }),
      outputSchema: z.object({
        final: z.number(),
      }),
      execute: async ({ inputData }) => {
        return { final: inputData.doubled + 10 };
      },
    });

    const simpleWorkflow = createWorkflow({
      id: 'simple-workflow',
      inputSchema: z.object({ input: z.number() }),
      outputSchema: z.object({ final: z.number() }),
    })
      .then(stepOne)
      .then(stepTwo);

    simpleWorkflow.commit();

    // Create Mastra instance with the workflow
    const mastra = new Mastra({
      workflows: {
        simpleWorkflow,
      },
    });

    // Try to execute the workflow
    const workflow = mastra.getWorkflow('simpleWorkflow');
    expect(workflow).toBeTruthy();

    // Test with destructured start method (the original failing case)
    const { start } = workflow.createRun();
    const result = await start({ inputData: { input: 10 } });

    // If we get here, the bug is fixed!
    expect(result).toBeTruthy();
    expect(result.status).toBe('success');
    expect(result.result.final).toBe(30); // (10 * 2) + 10 = 30
  });
});
