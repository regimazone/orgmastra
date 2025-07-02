import type { z } from 'zod';

import type { Mastra } from '../mastra';
import type { Metric } from '../eval';
import { AvailableHooks, executeHook } from '../hooks';
import { MastraError, ErrorCategory, ErrorDomain } from '../error';
import type { 
  ToolAction, 
  ToolExecutionContext, 
  ToolEvaluationInput, 
  ToolEvaluationResult, 
  ToolEvaluationOptions 
} from './types';

export class Tool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
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

  /**
   * Evaluate the tool's performance using a given metric
   */
  async evaluate(
    evaluationInput: ToolEvaluationInput,
    metric: Metric,
    options: ToolEvaluationOptions = {}
  ): Promise<ToolEvaluationResult> {
    const runId = options.runId || crypto.randomUUID();
    const globalRunId = options.globalRunId || crypto.randomUUID();
    
    if (!this.execute) {
      throw new MastraError({
        id: 'TOOL_EVALUATION_NO_EXECUTE',
        domain: ErrorDomain.EVAL,
        category: ErrorCategory.USER,
        details: {
          toolId: this.id,
          runId,
        },
      });
    }

    let toolOutput: any;
    let executionTime: number;
    let success = false;
    let error: string | undefined;
    const startTime = Date.now();

    try {
      // Create a context for tool execution
      const context = {
        context: evaluationInput.input,
        runtimeContext: {
          runId,
          globalRunId,
        },
        mastra: this.mastra,
      } as unknown as TContext;

      toolOutput = await this.execute(context, options.toolOptions);
      executionTime = Date.now() - startTime;
      success = true;
    } catch (e: unknown) {
      executionTime = Date.now() - startTime;
      success = false;
      error = e instanceof Error ? e.message : String(e);
      
      throw new MastraError(
        {
          id: 'TOOL_EVALUATION_EXECUTION_FAILED',
          domain: ErrorDomain.EVAL,
          category: ErrorCategory.USER,
          details: {
            toolId: this.id,
            runId,
            globalRunId,
          },
        },
        e,
      );
    }

    let metricResult;
    try {
      // For tool evaluation, we pass the input and output to the metric
      const inputStr = typeof evaluationInput.input === 'string' 
        ? evaluationInput.input 
        : JSON.stringify(evaluationInput.input);
      const outputStr = typeof toolOutput === 'string' 
        ? toolOutput 
        : JSON.stringify(toolOutput);
      
      metricResult = await metric.measure(inputStr, outputStr);
    } catch (e: unknown) {
      throw new MastraError(
        {
          id: 'TOOL_EVALUATION_METRIC_FAILED',
          domain: ErrorDomain.EVAL,
          category: ErrorCategory.USER,
          details: {
            toolId: this.id,
            metricName: metric.constructor.name,
            runId,
            globalRunId,
          },
        },
        e,
      );
    }

    const evaluationResult: ToolEvaluationResult = {
      ...metricResult,
      output: toolOutput,
      input: evaluationInput.input,
      executionTime,
      success,
      error,
    };

    // Execute evaluation hooks
    const traceObject = {
      toolId: this.id,
      toolDescription: this.description,
      input: evaluationInput.input,
      output: toolOutput,
      result: metricResult,
      metricName: metric.constructor.name,
      executionTime,
      success,
      error,
      runId,
      globalRunId,
      testInfo: options.testInfo,
    };

    try {
      executeHook(AvailableHooks.ON_TOOL_EVALUATION, traceObject);
    } catch (e: unknown) {
      throw new MastraError(
        {
          id: 'TOOL_EVALUATION_HOOK_FAILED',
          domain: ErrorDomain.EVAL,
          category: ErrorCategory.USER,
          details: {
            toolId: this.id,
            metricName: metric.constructor.name,
            runId,
            globalRunId,
          },
        },
        e,
      );
    }

    return evaluationResult;
  }
}

export function createTool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
  TExecute extends ToolAction<TSchemaIn, TSchemaOut, TContext>['execute'] = ToolAction<
    TSchemaIn,
    TSchemaOut,
    TContext
  >['execute'],
>(
  opts: ToolAction<TSchemaIn, TSchemaOut, TContext> & {
    execute?: TExecute;
  },
): [TSchemaIn, TSchemaOut, TExecute] extends [z.ZodSchema, z.ZodSchema, Function]
  ? Tool<TSchemaIn, TSchemaOut, TContext> & {
      inputSchema: TSchemaIn;
      outputSchema: TSchemaOut;
      execute: (context: TContext) => Promise<any>;
    }
  : Tool<TSchemaIn, TSchemaOut, TContext> {
  return new Tool(opts) as any;
}
