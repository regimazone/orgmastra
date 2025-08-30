import { basename, dirname } from 'path';
import { workflowMap } from '@mastra/agent-builder';
import type { RuntimeContext } from '@mastra/core/runtime-context';
import { WorkflowRegistry } from '../utils';
import * as workflows from './workflows';
import type { Context } from '../types';

interface AgentBuilderContext extends Context {
  actionId: string;
  runtimeContext?: RuntimeContext;
  runId?: string;
  repo: string;
  ref?: string;
  slug?: string;
  targetPath?: string;
  variables?: Record<string, string>;
  body?: { step: string | string[]; resumeData?: unknown };
  event?: string;
  data?: unknown;
  eventType?: 'watch' | 'watch-v2';
}

export interface TemplateInstallationRequest {
  /** Template repository URL or slug */
  repo: string;
  /** Git ref (branch/tag/commit) to install from */
  ref?: string;
  /** Template slug for identification */
  slug?: string;
  /** Target project path */
  targetPath?: string;
  /** Environment variables for template */
  variables?: Record<string, string>;
}

// Helper function to resolve target path and set runtime context variables
function prepareAgentBuilderWorkflowInstallation({
  targetPath,
  variables,
  runtimeContext,
}: {
  targetPath?: string;
  variables?: Record<string, string>;
  runtimeContext?: RuntimeContext;
}) {
  // Resolve default targetPath when not explicitly provided
  let effectiveTargetPath = targetPath;
  if (!effectiveTargetPath) {
    const envRoot = process.env.MASTRA_PROJECT_ROOT?.trim();
    if (envRoot) {
      effectiveTargetPath = envRoot;
    } else {
      const cwd = process.cwd();
      const parent = dirname(cwd);
      const grand = dirname(parent);
      // Detect when running under `<project>/.mastra/output` and resolve back to project root
      if (basename(cwd) === 'output' && basename(parent) === '.mastra') {
        effectiveTargetPath = grand;
      } else {
        effectiveTargetPath = cwd;
      }
    }
  }

  // Set environment variables in runtime context if provided
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      runtimeContext?.set(key, value);
    });
  }

  return effectiveTargetPath;
}

/**
 * Creates a modified Mastra instance that includes the agent builder workflows
 * and prepares parameters
 */
function createAgentBuilderWorkflowContext({
  targetPath,
  variables,
  runtimeContext,
  repo,
  ref,
  slug,
}: {
  targetPath?: string;
  variables?: Record<string, string>;
  runtimeContext?: RuntimeContext;
  repo: string;
  ref?: string;
  slug?: string;
}) {
  const effectiveTargetPath = prepareAgentBuilderWorkflowInstallation({ targetPath, variables, runtimeContext });

  for (const [slug, workflow] of Object.entries(workflowMap)) {
    WorkflowRegistry.registerTemporaryWorkflow(slug, workflow);
  }

  const inputData = {
    repo,
    ref: ref || 'main',
    slug: slug || basename(repo).replace(/\.git$/, '') || 'template',
    targetPath: effectiveTargetPath,
  };

  return {
    inputData,
    effectiveTargetPath,
  };
}

/**
 * Generic wrapper that converts template handlers to use workflow handlers
 * TWorkflowArgs - The argument type expected by the workflow handler
 * TResult - The return type of the workflow handler
 */
function createAgentBuilderWorkflowHandler<TWorkflowArgs, TResult>(
  workflowHandlerFn: (args: TWorkflowArgs) => Promise<TResult>,
  logMessage: string,
) {
  return async (builderArgs: AgentBuilderContext): Promise<TResult> => {
    const { mastra, runtimeContext, actionId, repo, ref, slug, targetPath, variables, runId, body, event, data } =
      builderArgs;
    const logger = mastra.getLogger();

    try {
      const { inputData, effectiveTargetPath } = createAgentBuilderWorkflowContext({
        targetPath,
        variables,
        runtimeContext,
        repo,
        ref,
        slug,
      });

      logger.info(logMessage, {
        runId,
        repo,
        ref: ref || 'main',
        slug,
        targetPath: effectiveTargetPath,
        variables,
        ...(body && { step: body.step }),
        ...(event && { event }),
      });

      try {
        // Build the handler args based on what the workflow handler expects
        // TypeScript will ensure we match the TWorkflowArgs type
        const baseArgs = {
          mastra,
          workflowId: actionId,
          runId,
          runtimeContext,
        };

        const handlerArgs = {
          ...baseArgs,
          // Add body for resume handlers
          ...(body && { body }),
          // Add event and data for event handlers
          ...(event !== undefined && data !== undefined && { event, data }),
          // Add inputData for regular handlers (when no body or event)
          ...(!body && event === undefined && { inputData }),
        } as TWorkflowArgs;

        const result = await workflowHandlerFn(handlerArgs);
        return result;
      } finally {
        // Clean up the temporary workflow registration
        WorkflowRegistry.cleanup('agent-builder-template');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`${logMessage} failed`, {
        runId,
        repo,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  };
}

export const getAgentBuilderActionsHandler = createAgentBuilderWorkflowHandler(
  workflows.getWorkflowsHandler,
  'Getting agent builder actions',
);

export const getAgentBuilderActionByIdHandler = createAgentBuilderWorkflowHandler(
  workflows.getWorkflowByIdHandler,
  'Getting agent builder action by ID',
);

export const getAgentBuilderActionRunByIdHandler = createAgentBuilderWorkflowHandler(
  workflows.getWorkflowRunByIdHandler,
  'Getting agent builder action run by ID',
);

export const getAgentBuilderActionRunExecutionResultHandler = createAgentBuilderWorkflowHandler(
  workflows.getWorkflowRunExecutionResultHandler,
  'Getting agent builder action run execution result',
);

export const createAgentBuilderActionRunHandler = createAgentBuilderWorkflowHandler(
  workflows.createWorkflowRunHandler,
  'Creating agent builder action run',
);

export const startAsyncAgentBuilderActionHandler = createAgentBuilderWorkflowHandler(
  workflows.startAsyncWorkflowHandler,
  'Starting async agent builder action',
);

export const startAgentBuilderActionRunHandler = createAgentBuilderWorkflowHandler(
  workflows.startWorkflowRunHandler,
  'Starting agent builder action run',
);

export const watchAgentBuilderActionHandler = createAgentBuilderWorkflowHandler(
  workflows.watchWorkflowHandler,
  'Watching agent builder action',
);

export const streamAgentBuilderActionHandler = createAgentBuilderWorkflowHandler(
  workflows.streamWorkflowHandler,
  'Streaming agent builder action',
);

export const streamVNextAgentBuilderActionHandler = createAgentBuilderWorkflowHandler(
  workflows.streamVNextWorkflowHandler,
  'Streaming VNext agent builder action',
);

export const resumeAsyncAgentBuilderActionHandler = createAgentBuilderWorkflowHandler(
  workflows.resumeAsyncWorkflowHandler,
  'Resuming async agent builder action',
);

export const resumeAgentBuilderActionHandler = createAgentBuilderWorkflowHandler(
  workflows.resumeWorkflowHandler,
  'Resuming agent builder action',
);

export const getAgentBuilderActionRunsHandler = createAgentBuilderWorkflowHandler(
  workflows.getWorkflowRunsHandler,
  'Getting agent builder action runs',
);

export const cancelAgentBuilderActionRunHandler = createAgentBuilderWorkflowHandler(
  workflows.cancelWorkflowRunHandler,
  'Cancelling agent builder action run',
);

export const sendAgentBuilderActionRunEventHandler = createAgentBuilderWorkflowHandler(
  workflows.sendWorkflowRunEventHandler,
  'Sending agent builder action run event',
);
