import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { storage } from './storage';

import { chefAgent, chefAgentResponses, dynamicAgent } from './agents/index';
import { myMcpServer, myMcpServerTwo } from './mcp/server';
import { myWorkflow } from './workflows';
import { promptWorkflow } from './workflows/prompt';
import { evalAgent } from './agents/eval-agent';
import { promptAgent } from './agents/prompt-agent';
import { prompt } from './prompts';

console.log('Mastra initialized', prompt)

export const mastra = new Mastra({
  agents: { chefAgent, chefAgentResponses, dynamicAgent, evalAgent, promptAgent },
  logger: new PinoLogger({ name: 'Chef', level: 'debug' }),
  storage: storage,
  mcpServers: {
    myMcpServer,
    myMcpServerTwo,
  },
  workflows: { myWorkflow, promptWorkflow },
});
