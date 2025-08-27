import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';

import { weatherAgent } from './agents';
import { weatherWorkflow as legacyWeatherWorkflow } from './workflows';
import { weatherWorkflow, weatherWorkflow2 } from './workflows/new-workflow';

const mastra = new Mastra({
  storage: new LibSQLStore({
    url: 'file:./mastra.db',
  }),
  agents: { weatherAgent },
  legacy_workflows: { legacyWeatherWorkflow },
  workflows: { weatherWorkflow, weatherWorkflow2 },
});

(async () => {
  try {
    const agent = mastra.getAgent('weatherAgent');
    const fallbacks = agent.fallbackModels;
    console.log('fallbacks===', fallbacks);

    const stream = await agent.stream('What is the weather in Tokyo?');
    for await (const chunk of stream.textStream) {
      console.log('chunk===', chunk);
    }

    // const run = await agent.run({
    //   input: { city: 'New York' },
    // });
    // console.log('run===', run);
  } catch (error) {
    console.error(error);
  }
})();
