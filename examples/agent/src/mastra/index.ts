import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';

import { chefAgent, chefAgentResponses, dynamicAgent, promptRelevancyEnhancer, questionEnhancer, tutorAgent } from './agents/index';

export const mastra = new Mastra({
  agents: { tutorAgent, questionEnhancer, promptRelevancyEnhancer },
  logger: new PinoLogger({ name: 'Chef', level: 'debug' }),
});
