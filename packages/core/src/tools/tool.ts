import type { z } from 'zod';

import type { Mastra } from '../mastra';
import type { ToolAction, ToolExecutionContext } from './types';

export class Tool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext = any,
> implements ToolAction<TSchemaIn, TSchemaOut, TContext>
{
  id: string;
  description: string;
  inputSchema?: TSchemaIn;
  outputSchema?: TSchemaOut;
  execute?: ToolAction<TSchemaIn, TSchemaOut, TContext>['execute'];
  mastra?: Mastra;

  constructor(opts: ToolAction<TSchemaIn, TSchemaOut, TContext>) {
    this.id = opts.id;
    this.description = opts.description;
    this.inputSchema = opts.inputSchema;
    this.outputSchema = opts.outputSchema;
    this.execute = opts.execute;
    this.mastra = opts.mastra;
  }
}

export function createTool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
>(
  opts: ToolAction<TSchemaIn, TSchemaOut, any> & {
    execute?: (context: any) => Promise<any>;
  },
): [TSchemaIn, TSchemaOut] extends [z.ZodSchema, z.ZodSchema]
  ? Tool<TSchemaIn, TSchemaOut, any> & {
      inputSchema: TSchemaIn;
      outputSchema: TSchemaOut;
      execute: (context: any) => Promise<any>;
    }
  : Tool<TSchemaIn, TSchemaOut, any> {
  return new Tool(opts) as any;
}
