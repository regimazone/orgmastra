import { Mastra } from '@mastra/core';
import { CloudflareWorkflowsExecutionEngine } from '@mastra/cloudflare-workflows/engine';
import { simpleWorkflow } from './workflows/simple-workflow.js';

export const mastra = new Mastra({
  workflows: { simpleWorkflow },
  workflowOptions: {
    executionEngine: CloudflareWorkflowsExecutionEngine,
  },
});
