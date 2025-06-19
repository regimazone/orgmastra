// Isolated test file that only imports what we need
import { z } from 'zod';

// Copy the essential types we need
type MastraUnion = any;
type RuntimeContext = {
  get(key: string): any;
};

interface ToolExecutionContext<TSchemaIn extends z.ZodSchema | undefined = undefined> {
  context: TSchemaIn extends z.ZodSchema ? z.infer<TSchemaIn> : any;
  mastra?: MastraUnion;
  runtimeContext: RuntimeContext;
}

// Copy our createTool function
function createTool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
>(
  opts: {
    id: string;
    description: string;
    inputSchema?: TSchemaIn;
    outputSchema?: TSchemaOut;
    execute?: (context: {
      context: TSchemaIn extends z.ZodSchema ? z.infer<TSchemaIn> : any;
      mastra?: MastraUnion;
      runtimeContext: RuntimeContext;
    }) => Promise<TSchemaOut extends z.ZodSchema ? z.infer<TSchemaOut> : unknown>;
  }
) {
  return opts as any;
}

// Test the type inference
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
    // Test: these should be properly typed
    const name: string = context.name;
    const age: number = context.age;
    
    // Test: this should cause an error if types are working
    // @ts-expect-error - This property should not exist
    const invalid = context.invalid;
    
    return { 
      greeting: `Hello ${name}!`,
      isAdult: age >= 18
    };
  },
});

export { tool };