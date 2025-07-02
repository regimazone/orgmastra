import type { z } from 'zod';

import type { Metric } from '../eval';
import { AvailableHooks, executeHook } from '../hooks';
import { MastraError, ErrorCategory, ErrorDomain } from '../error';
import type { Tool } from './tool';
import type { 
  ToolExecutionContext, 
  ToolEvaluationInput, 
  ToolEvaluationResult, 
  ToolEvaluationOptions 
} from './types';

/**
 * Evaluate a tool's performance using a given metric
 */
export async function evaluateTool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
>(
  tool: Tool<TSchemaIn, TSchemaOut, TContext>,
  evaluationInput: ToolEvaluationInput,
  metric: Metric,
  options: ToolEvaluationOptions = {}
): Promise<ToolEvaluationResult> {
  if (tool.evaluate) {
    // Use the tool's built-in evaluation method if available
    return tool.evaluate(evaluationInput, metric, options);
  }

  // Fallback to standalone evaluation
  const runId = options.runId || crypto.randomUUID();
  const globalRunId = options.globalRunId || crypto.randomUUID();
  
  if (!tool.execute) {
    throw new MastraError({
      id: 'TOOL_EVALUATION_NO_EXECUTE',
      domain: ErrorDomain.EVAL,
      category: ErrorCategory.USER,
      details: {
        toolId: tool.id,
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
      mastra: tool.mastra,
    } as unknown as TContext;

    toolOutput = await tool.execute(context, options.toolOptions);
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
          toolId: tool.id,
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
          toolId: tool.id,
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
    toolId: tool.id,
    toolDescription: tool.description,
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
          toolId: tool.id,
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

/**
 * Evaluate multiple tools with the same input and metric
 */
export async function evaluateTools<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
>(
  tools: Tool<TSchemaIn, TSchemaOut, TContext>[],
  evaluationInput: ToolEvaluationInput,
  metric: Metric,
  options: ToolEvaluationOptions = {}
): Promise<ToolEvaluationResult[]> {
  const globalRunId = options.globalRunId || crypto.randomUUID();
  
  const evaluationPromises = tools.map(tool => 
    evaluateTool(tool, evaluationInput, metric, {
      ...options,
      globalRunId,
      runId: options.runId || crypto.randomUUID(),
    })
  );

  return Promise.all(evaluationPromises);
}

/**
 * Run a benchmark test on a tool with multiple inputs
 */
export async function benchmarkTool<
  TSchemaIn extends z.ZodSchema | undefined = undefined,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
  TContext extends ToolExecutionContext<TSchemaIn> = ToolExecutionContext<TSchemaIn>,
>(
  tool: Tool<TSchemaIn, TSchemaOut, TContext>,
  evaluationInputs: ToolEvaluationInput[],
  metric: Metric,
  options: ToolEvaluationOptions = {}
): Promise<ToolEvaluationResult[]> {
  const globalRunId = options.globalRunId || crypto.randomUUID();
  
  const evaluationPromises = evaluationInputs.map(input => 
    evaluateTool(tool, input, metric, {
      ...options,
      globalRunId,
      runId: crypto.randomUUID(),
    })
  );

  return Promise.all(evaluationPromises);
}