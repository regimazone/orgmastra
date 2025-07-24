import { DefaultExecutionEngine } from '@mastra/core/workflows';
import type { Mastra } from '@mastra/core';

// TODO: make this actually make HTTP calls to the CF WF instance that got deployed
export class CloudflareWorkflowsExecutionEngine extends DefaultExecutionEngine {
  constructor(mastra: Mastra) {
    super({ mastra });
  }
}
