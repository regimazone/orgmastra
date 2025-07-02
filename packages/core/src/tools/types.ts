import type { ToolExecutionOptions, Tool, Schema } from 'ai';
import type { JSONSchema7Type } from 'json-schema';
import type { ZodSchema, z } from 'zod';

import type { IAction, IExecutionContext, MastraUnion } from '../action';
import type { Mastra } from '../mastra';
import type { RuntimeContext } from '../runtime-context';
import type { Metric, MetricResult } from '../eval';

export type VercelTool = Tool;

// Define CoreTool as a discriminated union to match the AI SDK's Tool type
export type CoreTool = {
  id?: string;
  description?: string;
  parameters: ZodSchema | JSONSchema7Type | Schema;
  outputSchema?: ZodSchema | JSONSchema7Type | Schema;
  execute?: (params: any, options: ToolExecutionOptions) => Promise<any>;
} & (
  | {
      type?: 'function' | undefined;
      id?: string;
    }
  | {
      type: 'provider-defined';
      id: `${string}.${string}`;
      args: Record<string, unknown>;
    }
);

// Duplicate of CoreTool but with parameters as Schema to make it easier to work with internally
export type InternalCoreTool = {
  id?: string;
  description?: string;
  parameters: Schema;
  outputSchema?: Schema;
  execute?: (params: any, options: ToolExecutionOptions) => Promise<any>;
} & (
  | {
      type?: 'function' | undefined;
      id?: string;
    }
  | {
      type: 'provider-defined';
      id: `${string}.${string}`;
      args: Record<string, unknown>;
    }
);

export interface ToolExecutionContext<TSchemaIn extends z.ZodSchema | undefined = undefined>
  extends IExecutionContext<TSchemaIn> {
  mastra?: MastraUnion;
  runtimeContext: RuntimeContext;
}

export interface ToolAction<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
> extends IAction<string, TSchemaIn, TSchemaOut, TContext, ToolExecutionOptions> {
  description: string;
  execute?: (
    context: TContext,
    options?: ToolExecutionOptions,
  ) => Promise<TSchemaOut extends z.ZodSchema ? z.infer<TSchemaOut> : unknown>;
  mastra?: Mastra;
}

// Tool evaluation types
export interface ToolEvaluationInput {
  /** The input parameters passed to the tool */
  input: any;
  /** The expected output (for comparison metrics) */
  expectedOutput?: any;
  /** Additional context for evaluation */
  context?: Record<string, any>;
}

export interface ToolEvaluationResult extends MetricResult {
  /** The actual tool output */
  output: any;
  /** The input that was used */
  input: any;
  /** Tool execution time in milliseconds */
  executionTime?: number;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Error information if execution failed */
  error?: string;
}

export interface ToolEvaluationOptions {
  /** Run ID for tracking evaluations */
  runId?: string;
  /** Global run ID for grouping evaluations */
  globalRunId?: string;
  /** Test information */
  testInfo?: {
    testName?: string;
    testPath?: string;
  };
  /** Additional options passed to tool execution */
  toolOptions?: ToolExecutionOptions;
}

/** Function type for evaluating tool performance */
export type ToolEvaluationFunction<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
> = (
  input: ToolEvaluationInput,
  metric: Metric,
  options?: ToolEvaluationOptions,
) => Promise<ToolEvaluationResult>;
