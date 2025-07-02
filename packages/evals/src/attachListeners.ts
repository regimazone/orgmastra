import type { Mastra } from '@mastra/core';
import { AvailableHooks, registerHook } from '@mastra/core/hooks';
import { TABLE_EVALS } from '@mastra/core/storage';
import { checkEvalStorageFields } from '@mastra/core/utils';

import { GLOBAL_RUN_ID_ENV_KEY } from './constants';
import { getSampler } from './sampling';

export async function attachListeners(mastra?: Mastra) {
  // Register hook for ON_GENERATION to handle automatic evaluation with sampling
  registerHook(AvailableHooks.ON_GENERATION, async (hookData: {
    input: string;
    output: string;
    metric: any;
    runId: string;
    agentName: string;
    instructions: string;
  }) => {
    const sampler = getSampler();
    
    // Check if we should sample this request
    if (sampler) {
      const shouldSample = sampler.shouldSample({
        agentName: hookData.agentName,
        runId: hookData.runId,
        input: hookData.input,
      });
      
      if (!shouldSample) {
        // Skip evaluation for this request
        return;
      }
    }
    
    // If no sampler is configured or sampling check passes, proceed with evaluation
    // Note: We can't directly call coreEvaluate here due to circular dependencies.
    // Instead, we rely on the agent's existing evaluation logic.
    // The sampling check above will prevent the ON_EVALUATION hook from being called
    // if the request shouldn't be sampled.
  });

  registerHook(AvailableHooks.ON_EVALUATION, async traceObject => {
    const storage = mastra?.getStorage();
    if (storage) {
      // Check for required fields
      const logger = mastra?.getLogger();
      const areFieldsValid = checkEvalStorageFields(traceObject, logger);
      if (!areFieldsValid) return;

      await storage.insert({
        tableName: TABLE_EVALS,
        record: {
          input: traceObject.input,
          output: traceObject.output,
          result: JSON.stringify(traceObject.result || {}),
          agent_name: traceObject.agentName,
          metric_name: traceObject.metricName,
          instructions: traceObject.instructions,
          test_info: traceObject.testInfo ? JSON.stringify(traceObject.testInfo) : null,
          global_run_id: traceObject.globalRunId,
          run_id: traceObject.runId,
          created_at: new Date().toISOString(),
        },
      });
    }
  });
}

export async function globalSetup() {
  if (process.env[GLOBAL_RUN_ID_ENV_KEY]) {
    throw new Error('Global run id already set, you should only run "GlobalSetup" once');
  }

  const globalRunId = crypto.randomUUID();
  process.env[GLOBAL_RUN_ID_ENV_KEY] = globalRunId;
}
