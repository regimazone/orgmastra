import { MastraClient } from '@mastra/client-js';
import { z } from 'zod';

async function main() {
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
}

main().catch(console.error);
