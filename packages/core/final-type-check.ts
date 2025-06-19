// Final test to confirm type inference works correctly
import { z } from 'zod';
import { createTool } from './src/tools';

const tool = createTool({
  id: 'test',
  description: 'test',
  inputSchema: z.object({ 
    name: z.string(),
    age: z.number()
  }),
  outputSchema: z.object({ 
    greeting: z.string(),
    isAdult: z.boolean()
  }),
  execute: async ({ context }) => {
    // These should be properly typed now
    const name: string = context.name;
    const age: number = context.age;
    
    return { 
      greeting: `Hello ${name}!`,
      isAdult: age >= 18
    };
  },
});

export { tool };