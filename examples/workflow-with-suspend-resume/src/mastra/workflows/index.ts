import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const stepOne = createStep({
  id: 'stepOne',
  inputSchema: z.any(),
  outputSchema: z.any(),
  execute: async ({ inputData, mastra }) => {
    const agentResult = await mastra.getAgent('weatherAgent').generate("What's the weather like in London?");
    console.log('stepOne', agentResult);

    return inputData;
  },
});

export const myWorkflow = createWorkflow({
  id: 'my-workflow',
  inputSchema: z.any(),
  outputSchema: z.any(),
})
  .then(stepOne)
  .commit();
