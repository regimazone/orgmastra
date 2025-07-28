import { Mastra } from '@mastra/core';
// import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';

import { weatherAgent } from './agents';
import { myWorkflow } from './workflows';

export const mastra = new Mastra({
  agents: {
    weatherAgent,
  },
  workflows: {
    myWorkflow,
  },
  storage: new PostgresStore({
    connectionString: 'postgresql://postgres:postgres@localhost:5434/mastra',
  }),
});

// storage: new LibSQLStore({
//   url: 'file:./workflow-snapshots.db',
// }),
