// This file simulates the user's scenario where NonRetriableError is imported
// but not captured by the bundler's dependency analysis

import { type Inngest, NonRetriableError } from 'inngest';

// User's function that tries to use NonRetriableError
export const createUserFunction = (inngest: Inngest) => {
  return inngest.createFunction(
    {
      id: 'user-function',
      name: 'User Function',
    },
    { event: 'user.test' },
    async ({ event, step }) => {
      try {
        // Some business logic
        const result = await step.run('process', async () => {
          if (event.data.shouldFail) {
            throw new Error('Simulated failure');
          }
          return { success: true };
        });

        return result;
      } catch (error) {
        // User wants to throw NonRetriableError for certain conditions
        if (error instanceof Error && error.message.includes('critical')) {
          throw new NonRetriableError('Critical error - do not retry');
        }
        throw error;
      }
    },
  );
};
