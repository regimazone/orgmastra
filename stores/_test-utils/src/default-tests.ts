import { randomUUID } from 'crypto';
import { describe, beforeAll, beforeEach, afterAll } from 'vitest';
import type { MastraStorage } from '@mastra/core/storage';
import {
  TABLE_WORKFLOW_SNAPSHOT,
  TABLE_EVALS,
  TABLE_MESSAGES,
  TABLE_THREADS,
} from '@mastra/core/storage';
import { createScoresTest } from './domains/scores';
import { createConversationsTest } from './domains/conversations';
import { createWorkflowsTests } from './domains/workflows';
import { createTraceTests } from './domains/traces';
import { createEvalsTests } from './domains/evals';
import { createOperationsTests } from './domains/operations';
export * from './domains/conversations/data';
export * from './domains/workflows/data';
export * from './domains/evals/data';

export const createSampleTraceForDB = (
  name: string,
  scope?: string,
  attributes?: Record<string, string>,
  createdAt?: Date,
) => ({
  id: `trace-${randomUUID()}`,
  parentSpanId: `span-${randomUUID()}`,
  traceId: `trace-${randomUUID()}`,
  name,
  scope,
  kind: 0,
  status: JSON.stringify({ code: 'success' }),
  events: JSON.stringify([{ name: 'start', timestamp: Date.now() }]),
  links: JSON.stringify([]),
  attributes: attributes ? attributes : undefined,
  startTime: (createdAt || new Date()).getTime(),
  endTime: (createdAt || new Date()).getTime(),
  other: JSON.stringify({ custom: 'data' }),
  createdAt: createdAt || new Date(),
});



export function createTestSuite(storage: MastraStorage) {
  describe(storage.constructor.name, () => {

    beforeAll(async () => {
      await storage.init();
    });

    beforeEach(async () => {
      // Clear tables before each test
      await storage.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
      await storage.clearTable({ tableName: TABLE_EVALS });
      await storage.clearTable({ tableName: TABLE_MESSAGES });
      await storage.clearTable({ tableName: TABLE_THREADS });
    });

    afterAll(async () => {
      // Clear tables after tests
      await storage.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
      await storage.clearTable({ tableName: TABLE_EVALS });
      await storage.clearTable({ tableName: TABLE_MESSAGES });
      await storage.clearTable({ tableName: TABLE_THREADS });
    });

    createOperationsTests(storage);

    createWorkflowsTests(storage);

    // createTraceTests(storage);

    // createEvalsTests(storage);

    // createConversationsTest({ storage });

    // createScoresTest({ storage });

  });

}
