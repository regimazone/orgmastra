import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { promptAgent } from './agents/promptAgent.js';
import { promptTools } from './tools/promptTools.js';

export const mastra = new Mastra({
  agents: {
    promptAgent,
  },
  tools: promptTools,
  logger: new PinoLogger({
    name: 'PromptCMS',
    level: 'debug',
  }),
});
