import { z } from 'zod';
import { MastraClient } from './client';
// import type { WorkflowRunResult } from './types';

// Agent

(async () => {
  const client = new MastraClient({
    baseUrl: 'http://localhost:4111',
  });

  const agent = client.getAgent('chefAgent');

  const result = await agent.generate({
    messages: 'Please use my cooking tool to cook a meal. Ingredient pizza.',
    clientTools: {
      cookingTool: {
        id: 'cookingTool',
        description: 'A tool for cooking',
        inputSchema: z.object({
          ingredient: z.string(),
        }),
        execute: async ({ context }) => {
          return {
            result: `I am cooking with ${context.ingredient}`,
          };
        },
      },
    },
  });

  console.log(result);
})();

// Workflow
// (async () => {
// const client = new MastraClient({
//   baseUrl: 'http://localhost:4111',
// });

//   try {
//     const workflowId = 'myWorkflow';
//     const workflow = client.getWorkflow(workflowId);

//     const { runId } = await workflow.createRun();

//     workflow.watch({ runId }, record => {
//       console.log(new Date().toTimeString(), record);
//     });

//     await workflow.start({
//       runId,
//       triggerData: {
//         city: 'New York',
//       },
//     });

//   } catch (e) {
//     console.error('Workflow error:', e);
//   }
// })();
