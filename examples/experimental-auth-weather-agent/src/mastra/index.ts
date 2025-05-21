import { Mastra } from '@mastra/core';

import { weatherAgent } from './agents';
import { weatherWorkflow } from './workflows';
import { getAuthProvider } from './auth';

export const mastra = new Mastra({
  agents: { weatherAgent },
  workflows: { weatherWorkflow },
  server: {
    experimental_auth: getAuthProvider(),
  },
});
