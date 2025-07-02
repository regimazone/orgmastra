import type { z } from 'zod';

import type { Mastra } from '../mastra';
import type { Metric } from '../eval';
import { AvailableHooks, executeHook } from '../hooks';
import type { ToolAction, ToolExecutionContext } from './types';

export class Tool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
  TMetrics extends Record<string, Metric> = Record<string, Metric>,
> implements ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics>
{
  id: string;
  description: string;
  inputSchema?: TSchemaIn;
  outputSchema?: TSchemaOut;
  execute?: ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics>['execute'];
  mastra?: Mastra;
  evals: TMetrics;

  constructor(opts: ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics>) {
    this.id = opts.id;
    this.description = opts.description;
    this.inputSchema = opts.inputSchema;
    this.outputSchema = opts.outputSchema;
    this.execute = opts.execute;
    this.mastra = opts.mastra;
    this.evals = opts.evals || ({} as TMetrics);
  }

  /**
   * Execute the tool with automatic evaluation (following Agent pattern)
   */
  async run(
    context: TContext,
    options?: { runId?: string }
  ): Promise<TSchemaOut extends z.ZodSchema ? z.infer<TSchemaOut> : unknown> {
    if (!this.execute) {
      throw new Error(`Tool ${this.id} has no execute function`);
    }

    const runId = options?.runId || crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      // Execute the tool
      const result = await this.execute(context, { runId });
      const executionTime = Date.now() - startTime;

      // Trigger evaluations if any are configured (following Agent pattern)
      if (Object.keys(this.evals || {}).length > 0) {
        const inputStr = typeof context === 'string' 
          ? context 
          : JSON.stringify(context);
        const outputStr = typeof result === 'string' 
          ? result 
          : JSON.stringify(result);

                 for (const metric of Object.values(this.evals || {})) {
           executeHook(AvailableHooks.ON_TOOL_EVALUATION, {
             toolId: this.id,
             toolDescription: this.description,
             input: context,
             output: result,
             result: { score: 1, info: {} }, // Placeholder - actual evaluation happens in hook handlers
             metricName: metric.constructor.name,
             executionTime,
             success: true,
             runId,
             globalRunId: runId,
           });
         }
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Trigger evaluation hooks even on failure
      if (Object.keys(this.evals || {}).length > 0) {
        const inputStr = typeof context === 'string' 
          ? context 
          : JSON.stringify(context);

                 for (const metric of Object.values(this.evals || {})) {
           executeHook(AvailableHooks.ON_TOOL_EVALUATION, {
             toolId: this.id,
             toolDescription: this.description,
             input: context,
             output: '',
             result: { score: 0, info: {} }, // Placeholder for failed execution
             metricName: metric.constructor.name,
             executionTime,
             success: false,
             error: error instanceof Error ? error.message : String(error),
             runId,
             globalRunId: runId,
           });
         }
      }

      throw error;
    }
  }
}

export function createTool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
  TMetrics extends Record<string, Metric> = Record<string, Metric>,
  TExecute extends ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics>['execute'] = ToolAction<
    TSchemaIn,
    TSchemaOut,
    TContext,
    TMetrics
  >['execute'],
>(
  opts: ToolAction<TSchemaIn, TSchemaOut, TContext, TMetrics> & {
    execute?: TExecute;
  },
): [TSchemaIn, TSchemaOut, TExecute] extends [z.ZodSchema, z.ZodSchema, Function]
  ? Tool<TSchemaIn, TSchemaOut, TContext, TMetrics> & {
      inputSchema: TSchemaIn;
      outputSchema: TSchemaOut;
      execute: (context: TContext) => Promise<any>;
    }
  : Tool<TSchemaIn, TSchemaOut, TContext, TMetrics> {
  return new Tool(opts) as any;
}
