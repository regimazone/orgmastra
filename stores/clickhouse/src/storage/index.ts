import type { ClickHouseClient } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';
import { MessageList } from '@mastra/core/agent';
import type { MastraMessageContentV2 } from '@mastra/core/agent';
import { MastraError, ErrorDomain, ErrorCategory } from '@mastra/core/error';
import type { MetricResult, TestInfo, ScoreRowData } from '@mastra/core/eval';
import type { MastraMessageV1, MastraMessageV2, StorageThreadType } from '@mastra/core/memory';
import {
  MastraStorage,
  TABLE_EVALS,
  TABLE_SCORERS,
  TABLE_MESSAGES,
  TABLE_SCHEMAS,
  TABLE_THREADS,
  TABLE_TRACES,
  TABLE_WORKFLOW_SNAPSHOT,
} from '@mastra/core/storage';
import type {
  EvalRow,
  PaginationArgs,
  PaginationInfo,
  StorageColumn,
  StorageGetMessagesArg,
  TABLE_NAMES,
  WorkflowRun,
  WorkflowRuns,
  StorageGetTracesArg,
  TABLE_RESOURCES,
  StoragePagination,
  StorageDomains,
  StorageResourceType,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';

import { LegacyEvalsClickHouse } from './domains/legacy-evals';
import { MemoryClickHouse } from './domains/memory';
import { StoreOperationsClickHouse } from './domains/operations';
import { ScoresClickHouse } from './domains/scores';
import { TracesClickHouse } from './domains/traces';
import { WorkflowsClickHouse } from './domains/workflows';

type SUPPORTED_TABLE_NAMES = Exclude<TABLE_NAMES, typeof TABLE_RESOURCES>;

function safelyParseJSON(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    return {};
  }
}

type IntervalUnit =
  | 'NANOSECOND'
  | 'MICROSECOND'
  | 'MILLISECOND'
  | 'SECOND'
  | 'MINUTE'
  | 'HOUR'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'QUARTER'
  | 'YEAR';

export type ClickhouseConfig = {
  url: string;
  username: string;
  password: string;
  ttl?: {
    [TableKey in TABLE_NAMES]?: {
      row?: { interval: number; unit: IntervalUnit; ttlKey?: string };
      columns?: Partial<{
        [ColumnKey in keyof (typeof TABLE_SCHEMAS)[TableKey]]: {
          interval: number;
          unit: IntervalUnit;
          ttlKey?: string;
        };
      }>;
    };
  };
};

export const TABLE_ENGINES: Record<SUPPORTED_TABLE_NAMES, string> = {
  [TABLE_MESSAGES]: `MergeTree()`,
  [TABLE_WORKFLOW_SNAPSHOT]: `ReplacingMergeTree()`,
  [TABLE_TRACES]: `MergeTree()`,
  [TABLE_THREADS]: `ReplacingMergeTree()`,
  [TABLE_EVALS]: `MergeTree()`,
  [TABLE_SCORERS]: `MergeTree()`,
};

export const COLUMN_TYPES: Record<StorageColumn['type'], string> = {
  text: 'String',
  timestamp: 'DateTime64(3)',
  uuid: 'String',
  jsonb: 'String',
  integer: 'Int64',
  float: 'Float64',
  bigint: 'Int64',
};

function transformRows<R>(rows: any[]): R[] {
  return rows.map((row: any) => transformRow<R>(row));
}

function transformRow<R>(row: any): R {
  if (!row) {
    return row;
  }

  if (row.createdAt) {
    row.createdAt = new Date(row.createdAt);
  }
  if (row.updatedAt) {
    row.updatedAt = new Date(row.updatedAt);
  }
  return row;
}

export class ClickhouseStore extends MastraStorage {
  protected db: ClickHouseClient;
  protected ttl: ClickhouseConfig['ttl'] = {};

  stores: StorageDomains;

  constructor(config: ClickhouseConfig) {
    super({ name: 'ClickhouseStore' });
    this.db = createClient({
      url: config.url,
      username: config.username,
      password: config.password,
      clickhouse_settings: {
        date_time_input_format: 'best_effort',
        date_time_output_format: 'iso', // This is crucial
        use_client_time_zone: 1,
        output_format_json_quote_64bit_integers: 0,
      },
    });
    this.ttl = config.ttl;

    // Initialize domain stores
    const operations = new StoreOperationsClickHouse({ client: this.db });
    const scores = new ScoresClickHouse({ client: this.db, operations });
    const traces = new TracesClickHouse({ client: this.db, operations });
    const workflows = new WorkflowsClickHouse({ client: this.db, operations });
    const memory = new MemoryClickHouse({ client: this.db, operations });
    const legacyEvals = new LegacyEvalsClickHouse({ client: this.db });

    this.stores = {
      operations,
      scores,
      traces,
      workflows,
      memory,
      legacyEvals,
    };
  }

  public get supports() {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: true,
      createTable: true,
    };
  }

  private transformEvalRow(row: Record<string, any>): EvalRow {
    row = transformRow(row);
    const resultValue = JSON.parse(row.result as string);
    const testInfoValue = row.test_info ? JSON.parse(row.test_info as string) : undefined;

    if (!resultValue || typeof resultValue !== 'object' || !('score' in resultValue)) {
      throw new MastraError({
        id: 'CLICKHOUSE_STORAGE_INVALID_METRIC_FORMAT',
        text: `Invalid MetricResult format: ${JSON.stringify(resultValue)}`,
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
      });
    }

    return {
      input: row.input as string,
      output: row.output as string,
      result: resultValue as MetricResult,
      agentName: row.agent_name as string,
      metricName: row.metric_name as string,
      instructions: row.instructions as string,
      testInfo: testInfoValue as TestInfo,
      globalRunId: row.global_run_id as string,
      runId: row.run_id as string,
      createdAt: row.created_at as string,
    };
  }

  private escape(value: any): string {
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return value.toString();
  }

  /** @deprecated use getEvals instead */
  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    return this.stores.legacyEvals.getEvalsByAgentName(agentName, type);
  }

  async getEvals(
    options: {
      agentName?: string;
      type?: 'test' | 'live';
    } & PaginationArgs = {},
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    return this.stores.legacyEvals.getEvals(options);
  }

  async batchInsert({ tableName, records }: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    return this.stores.operations.batchInsert({ tableName, records });
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    return this.stores.operations.insert({ tableName, record });
  }

  async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null> {
    return this.stores.operations.load({ tableName, keys });
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.clearTable({ tableName });
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.dropTable({ tableName });
  }

  async hasColumn(table: string, column: string): Promise<boolean> {
    return this.stores.operations.hasColumn(table, column);
  }

  /** @deprecated use getTracesPaginated instead */
  async getTraces(args: StorageGetTracesArg): Promise<Trace[]> {
    return this.stores.traces.getTraces(args);
  }

  async batchTraceInsert({ records }: { records: Record<string, any>[] }): Promise<void> {
    return this.stores.traces.batchTraceInsert({ records });
  }

  async optimizeTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      await this.db.command({
        query: `OPTIMIZE TABLE ${tableName} FINAL`,
      });
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_OPTIMIZE_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async materializeTtl({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      await this.db.command({
        query: `ALTER TABLE ${tableName} MATERIALIZE TTL;`,
      });
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_MATERIALIZE_TTL_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
        return this.stores.operations.createTable({ tableName, schema });
  }

  async alterTable({
    tableName,
    schema,
    ifNotExists,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    return this.stores.operations.alterTable({ tableName, schema, ifNotExists });
  }
    try {
      const keyEntries = Object.entries(keys);
      const conditions = keyEntries
        .map(
          ([key]) =>
            `"${key}" = {var_${key}:${COLUMN_TYPES[TABLE_SCHEMAS[tableName as TABLE_NAMES]?.[key]?.type ?? 'text']}}`,
        )
        .join(' AND ');
      const values = keyEntries.reduce((acc, [key, value]) => {
        return { ...acc, [`var_${key}`]: value };
      }, {});

      const result = await this.db.query({
        query: `SELECT *, toDateTime64(createdAt, 3) as createdAt, toDateTime64(updatedAt, 3) as updatedAt FROM ${tableName} ${TABLE_ENGINES[tableName as SUPPORTED_TABLE_NAMES].startsWith('ReplacingMergeTree') ? 'FINAL' : ''} WHERE ${conditions}`,
        query_params: values,
        clickhouse_settings: {
          // Allows to insert serialized JS Dates (such as '2023-12-06T10:54:48.000Z')
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      if (!result) {
        return null;
      }

      const rows = await result.json();
      // If this is a workflow snapshot, parse the snapshot field
      if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
        const snapshot = rows.data[0] as any;
        if (!snapshot) {
          return null;
        }
        if (typeof snapshot.snapshot === 'string') {
          snapshot.snapshot = JSON.parse(snapshot.snapshot);
        }
        return transformRow(snapshot);
      }

      const data: R = transformRow(rows.data[0]);
      return data;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_LOAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    return this.stores.memory.getThreadById({ threadId });
  }

  /** @deprecated use getThreadsByResourceIdPaginated instead */
  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    return this.stores.memory.getThreadsByResourceId({ resourceId });
  }

  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    return this.stores.memory.saveThread({ thread });
  }

  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    return this.stores.memory.updateThread({ id, title, metadata });
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    return this.stores.memory.deleteThread({ threadId });
  }

  /** @deprecated use getMessagesPaginated instead */
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages({
    threadId,
    resourceId,
    selectBy,
    format,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    return this.stores.memory.getMessages({ threadId, resourceId, selectBy, format });
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: undefined | 'v1' } | { messages: MastraMessageV2[]; format: 'v2' },
  ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    return this.stores.memory.saveMessages(args);
  }

  async getResourceById({ resourceId }: { resourceId: string }): Promise<StorageResourceType | null> {
    return this.stores.memory.getResourceById({ resourceId });
  }

  async saveResource({ resource }: { resource: StorageResourceType }): Promise<StorageResourceType> {
    return this.stores.memory.saveResource({ resource });
  }

  async updateResource({
    resourceId,
    workingMemory,
    metadata,
  }: {
    resourceId: string;
    workingMemory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StorageResourceType> {
    return this.stores.memory.updateResource({ resourceId, workingMemory, metadata });
  }

  // Workflow methods
  async persistWorkflowSnapshot({
    workflowName,
    runId,
    snapshot,
  }: {
    workflowName: string;
    runId: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    return this.stores.workflows.persistWorkflowSnapshot({ workflowName, runId, snapshot });
  }

  async loadWorkflowSnapshot({
    workflowName,
    runId,
  }: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    return this.stores.workflows.loadWorkflowSnapshot({ workflowName, runId });
  }

  async getWorkflowRuns({
    workflowName,
    fromDate,
    toDate,
    limit,
    offset,
    resourceId,
  }: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
    resourceId?: string;
  } = {}): Promise<WorkflowRuns> {
    return this.stores.workflows.getWorkflowRuns({ workflowName, fromDate, toDate, limit, offset, resourceId });
  }

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    return this.stores.workflows.getWorkflowRunById({ runId, workflowName });
  }

  // Keep utility methods and optimizations that are specific to ClickHouse
  async optimizeTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      await this.db.command({
        query: `OPTIMIZE TABLE ${tableName} FINAL`,
      });
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_OPTIMIZE_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async materializeTtl({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      await this.db.command({
        query: `ALTER TABLE ${tableName} MATERIALIZE TTL;`,
      });
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_MATERIALIZE_TTL_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
