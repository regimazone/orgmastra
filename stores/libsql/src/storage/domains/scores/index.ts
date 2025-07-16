import { ScoresStorage } from '@mastra/core/storage';

import { createClient } from '@libsql/client';
import type { Client, InValue } from '@libsql/client';
import { MessageList } from '@mastra/core/agent';
import type { MastraMessageContentV2, MastraMessageV2 } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { MetricResult, TestInfo, ScoreRowData } from '@mastra/core/eval';
import type { MastraMessageV1, StorageThreadType } from '@mastra/core/memory';
import {
  MastraStorage,
  TABLE_EVALS,
  TABLE_MESSAGES,
  TABLE_THREADS,
  TABLE_TRACES,
  TABLE_RESOURCES,
  TABLE_WORKFLOW_SNAPSHOT,
  TABLE_SCORERS,
} from '@mastra/core/storage';
import type {
  EvalRow,
  PaginationArgs,
  PaginationInfo,
  StorageColumn,
  StorageGetMessagesArg,
  StorageResourceType,
  TABLE_NAMES,
  WorkflowRun,
  WorkflowRuns,
  StoragePagination,
} from '@mastra/core/storage';

import type { Trace } from '@mastra/core/telemetry';
import { parseSqlIdentifier } from '@mastra/core/utils';
import type { WorkflowRunState } from '@mastra/core/workflows';

export class ScoresLibSQL extends ScoresStorage {
  constructor() {
    super();
  }

  async saveScore(score: Omit<ScoreRowData, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ score: ScoreRowData }> {
    try {
      const id = crypto.randomUUID();

      await this.insert({
        tableName: TABLE_SCORERS,
        record: {
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...score,
        },
      });

      const scoreFromDb = await this.getScoreById({ id });
      return { score: scoreFromDb! };
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_SAVE_SCORE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }
}
