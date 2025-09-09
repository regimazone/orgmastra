import { Mastra } from '@mastra/core';
import { Inngest } from 'inngest'; // Add NonRetriableError import
import { init } from '@mastra/inngest';
import { z } from 'zod';
import { createUserFunction } from './inngest';
// Don't import the user function - this simulates the user's separate import

const inngest = new Inngest({
  id: 'test-app',
  name: 'Test App',
});

const { createWorkflow, createStep } = init(inngest);

// Simple step that doesn't directly use NonRetriableError
const testStep = createStep({
  id: 'test-step',
  description: 'A basic test step',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData }) => {
    return { result: `Processed: ${inputData.message}` };
  },
});

const testWorkflow = createWorkflow({
  id: 'test-workflow',
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  steps: [testStep],
});

// Force the bundler to see NonRetriableError is used
// console.log('Available error class:', NonRetriableError);

createUserFunction(inngest);

export const mastra = new Mastra({
  workflows: { testWorkflow },
});
