import { Mastra } from '@mastra/core';
import { CloudflareWorkflowsExecutionEngine } from '@mastra/cloudflare-workflows/engine';
import { simpleWorkflow } from './workflows/simple-workflow.js';

export const mastra = new Mastra({
  workflows: { simpleWorkflow },
  workflowOptions: {
    executionEngine: new CloudflareWorkflowsExecutionEngine({
      // workerUrl: 'https://mastra-cloudflare-workflows-example.caleb-303.workers.dev',
      workerUrl: 'http://localhost:8787',
    }),
  },
});
