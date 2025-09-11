import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

export const myWorkflow = createWorkflow({
  id: 'my-workflow',
  description: 'My workflow description',
  inputSchema: z.object({
    ingredient: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
});

const step = createStep({
  id: 'my-step',
  description: 'My step description',
  inputSchema: z.object({
    ingredient: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData }) => {
    return {
      result: inputData.ingredient,
    };
  },
});

const step2a = createStep({
  id: 'my-step-2a',
  description: 'call the chefAgentResponses agent',
  inputSchema: z.object({
    result: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('chefAgentResponses');
    const response = await agent.generate(inputData.result);
    return {
      result: response.text,
    };
  },
});

const step2b = createStep({
  id: 'my-step-2b',
  description: 'call the chefModelV2Agent agent',
  inputSchema: z.object({
    result: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent('chefModelV2Agent');
    const response = await agent.generateVNext(inputData.result);

    return {
      result: response.text,
    };
  },
});

myWorkflow.then(step).parallel([step2a, step2b]).commit();
