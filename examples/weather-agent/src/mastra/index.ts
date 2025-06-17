import { Mastra } from '@mastra/core';

import { weatherAgent, weatherAgentWithWorkflow } from './agents';
import { weatherWorkflow as legacyWeatherWorkflow } from './workflows';
import { weatherWorkflow, weatherWorkflow2, weatherWorkflowWithSuspend } from './workflows/new-workflow';

export const mastra = new Mastra({
  agents: { weatherAgent, weatherAgentWithWorkflow },
  legacy_workflows: { legacyWeatherWorkflow },
  workflows: { weatherWorkflow, weatherWorkflow2, weatherWorkflowWithSuspend },
});
