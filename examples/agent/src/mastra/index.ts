import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { InMemoryStore } from '@mastra/core/storage';

import { agentThatHarassesYou, chefAgent, chefAgentResponses, dynamicAgent, evalAgent } from './agents/index';
import { myMcpServer, myMcpServerTwo } from './mcp/server';
import { myWorkflow } from './workflows';
import { chefModelV2Agent } from './agents/model-v2-agent';
import { createScorer } from '@mastra/core/scores';
import { LangfuseExporter } from '@mastra/langfuse';
import { BraintrustExporter } from '@mastra/braintrust';
import { DefaultExporter } from '@mastra/core/ai-tracing';

const storage = new LibSQLStore({
  url: 'file:./mastra.db',
});

const testScorer = createScorer({
  name: 'scorer1',
  description: 'Scorer 1',
}).generateScore(() => {
  return 1;
});

export const mastra = new Mastra({
  agents: {
    chefAgent,
    chefAgentResponses,
    dynamicAgent,
    agentThatHarassesYou,
    evalAgent,
    chefModelV2Agent,
  },
  logger: new PinoLogger({ name: 'Chef', level: 'debug' }),
  storage: new InMemoryStore(),
  mcpServers: {
    myMcpServer,
    myMcpServerTwo,
  },
  workflows: { myWorkflow },
  bundler: {
    sourcemap: true,
  },
  serverMiddleware: [
    {
      handler: (c, next) => {
        console.log('Middleware called');
        return next();
      },
    },
  ],
  scorers: {
    testScorer,
  },
  observability: {
    default: {
      enabled: true,
    },
    configs: {
      langfuse: {
        serviceName: 'service',
        exporters: [
          new LangfuseExporter({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            baseUrl: process.env.LANGFUSE_BASE_URL,
            realtime: true,
          }),
          new BraintrustExporter({
            apiKey: process.env.BRAINTRUST_API_KEY,
          }),
        ],
      },
    },
  },
  // telemetry: {
  //   enabled: false,
  // }
});
