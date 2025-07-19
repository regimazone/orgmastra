import type { D1Database } from '@cloudflare/workers-types';
import type { MastraMessageContentV2 } from '@mastra/core/agent';
import { MessageList } from '@mastra/core/agent';
import { MastraError, ErrorDomain, ErrorCategory } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import type { StorageThreadType, MastraMessageV1, MastraMessageV2 } from '@mastra/core/memory';
import {
  MastraStorage,
} from '@mastra/core/storage';
import type {
  EvalRow,
  PaginationInfo,
  StorageColumn,
  StorageGetMessagesArg,
  TABLE_NAMES,
  WorkflowRun,
  StoragePagination,
  WorkflowRuns,
  PaginationArgs,
  StorageResourceType,
  StorageDomains,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';
import Cloudflare from 'cloudflare';
import { LegacyEvalsD1 } from './domains/legacy-evals';
import { MemoryD1 } from './domains/memory';
import { StoreOperationsD1 } from './domains/operations';
import { ScoresD1 } from './domains/scores';
import { TracesD1 } from './domains/traces';
import { WorkflowsD1 } from './domains/workflows';

/**
 * Configuration for D1 using the REST API
 */
export interface D1Config {
  /** Cloudflare account ID */
  accountId: string;
  /** Cloudflare API token with D1 access */
  apiToken: string;
  /** D1 database ID */
  databaseId: string;
  /** Optional prefix for table names */
  tablePrefix?: string;
}

export interface D1ClientConfig {
  /** Optional prefix for table names */
  tablePrefix?: string;
  /** D1 Client */
  client: D1Client;
}

/**
 * Configuration for D1 using the Workers Binding API
 */
export interface D1WorkersConfig {
  /** D1 database binding from Workers environment */
  binding: D1Database; // D1Database binding from Workers
  /** Optional prefix for table names */
  tablePrefix?: string;
}

/**
 * Combined configuration type supporting both REST API and Workers Binding API
 */
export type D1StoreConfig = D1Config | D1WorkersConfig | D1ClientConfig;

export type D1QueryResult = Awaited<ReturnType<Cloudflare['d1']['database']['query']>>['result'];
export interface D1Client {
  query(args: { sql: string; params: string[] }): Promise<{ result: D1QueryResult }>;
}

export class D1Store extends MastraStorage {
  private client?: D1Client;
  private binding?: D1Database; // D1Database binding
  private tablePrefix: string;

  stores: StorageDomains;

  /**
   * Creates a new D1Store instance
   * @param config Configuration for D1 access (either REST API or Workers Binding API)
   */
  constructor(config: D1StoreConfig) {
    try {
      super({ name: 'D1' });

      if (config.tablePrefix && !/^[a-zA-Z0-9_]*$/.test(config.tablePrefix)) {
        throw new Error('Invalid tablePrefix: only letters, numbers, and underscores are allowed.');
      }

      this.tablePrefix = config.tablePrefix || '';

      // Determine which API to use based on provided config
      if ('binding' in config) {
        if (!config.binding) {
          throw new Error('D1 binding is required when using Workers Binding API');
        }
        this.binding = config.binding;
        this.logger.info('Using D1 Workers Binding API');
      } else if ('client' in config) {
        if (!config.client) {
          throw new Error('D1 client is required when using D1ClientConfig');
        }
        this.client = config.client;
        this.logger.info('Using D1 Client');
      } else {
        if (!config.accountId || !config.databaseId || !config.apiToken) {
          throw new Error('accountId, databaseId, and apiToken are required when using REST API');
        }
        const cfClient = new Cloudflare({
          apiToken: config.apiToken,
        });
        this.client = {
          query: ({ sql, params }) => {
            return cfClient.d1.database.query(config.databaseId, {
              account_id: config.accountId,
              sql,
              params,
            });
          },
        };
        this.logger.info('Using D1 REST API');
      }

      // Initialize domain stores
      const operations = new StoreOperationsD1({
        client: this.client,
        binding: this.binding,
        tablePrefix: this.tablePrefix,
      });

      const scores = new ScoresD1({ operations });
      const traces = new TracesD1({ operations });
      const workflows = new WorkflowsD1({ operations });
      const memory = new MemoryD1({ operations });
      const legacyEvals = new LegacyEvalsD1({ operations });

      this.stores = {
        operations,
        scores,
        traces,
        workflows,
        memory,
        legacyEvals,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_INITIALIZATION_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.SYSTEM,
          text: 'Error initializing D1Store',
        },
        error,
      );
    }
  }

  public get supports() {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: true,
      createTable: true,
    };
  }

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    await this.stores.operations.createTable({ tableName, schema });
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
    await this.stores.operations.alterTable({ tableName, schema, ifNotExists });
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    await this.stores.operations.clearTable({ tableName });
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    await this.stores.operations.dropTable({ tableName });
  }

  public insert(args: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    return this.stores.operations.insert(args);
  }

  public batchInsert(args: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    return this.stores.operations.batchInsert(args);
  }

  async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null> {
    return this.stores.operations.load({ tableName, keys });
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    return this.stores.memory.getThreadById({ threadId });
  }

  /**
   * @deprecated use getThreadsByResourceIdPaginated instead for paginated results.
   */
  public async getThreadsByResourceId(args: { resourceId: string }): Promise<StorageThreadType[]> {
    return this.stores.memory.getThreadsByResourceId(args);
  }

  public async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page: number;
    perPage: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    return this.stores.memory.getThreadsByResourceIdPaginated(args);
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

  /**
   * @deprecated use getMessagesPaginated instead for paginated results.
   */
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages({
    threadId,
    selectBy,
    format,
  }: StorageGetMessagesArg & {
    format?: 'v1' | 'v2';
  }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    return this.stores.memory.getMessages({ threadId, selectBy, format });
  }

  public async getMessagesPaginated(
    args: StorageGetMessagesArg & {
      format?: 'v1' | 'v2';
    },
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    return this.stores.memory.getMessagesPaginated(args);
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: undefined | 'v1' } | { messages: MastraMessageV2[]; format: 'v2' },
  ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    return this.stores.memory.saveMessages(args);
  }

  async updateMessages({
    messages,
  }: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraMessageV2[]> {
    return this.stores.memory.updateMessages({ messages });
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

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    return this.stores.scores.getScoreById({ id });
  }

  async saveScore(score: Omit<ScoreRowData, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ score: ScoreRowData }> {
    return this.stores.scores.saveScore(score);
  }

  async getScoresByScorerId({
    scorerId,
    entityId,
    entityType,
    pagination,
  }: {
    scorerId: string;
    entityId?: string;
    entityType?: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    return this.stores.scores.getScoresByScorerId({ scorerId, entityId, entityType, pagination });
  }

  async getScoresByRunId({
    runId,
    pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    return this.stores.scores.getScoresByRunId({ runId, pagination });
  }

  async getScoresByEntityId({
    entityId,
    entityType,
    pagination,
  }: {
    pagination: StoragePagination;
    entityId: string;
    entityType: string;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    return this.stores.scores.getScoresByEntityId({ entityId, entityType, pagination });
  }

  /**
   * TRACES
   */

  /**
   * @deprecated use getTracesPaginated instead.
   */
  async getTraces(args: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<Trace[]> {
    return this.stores.traces.getTraces(args);
  }

  async getTracesPaginated(args: {
    name?: string;
    scope?: string;
    attributes?: Record<string, string>;
    page: number;
    perPage: number;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<PaginationInfo & { traces: Trace[] }> {
    return this.stores.traces.getTracesPaginated(args);
  }

  async batchTraceInsert(args: { records: Record<string, any>[] }): Promise<void> {
    return this.stores.traces.batchTraceInsert(args);
  }

  /**
   * WORKFLOWS
   */

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

  /**
   * Close the database connection
   * No explicit cleanup needed for D1 in either REST or Workers Binding mode
   */
  async close(): Promise<void> {
    this.logger.debug('Closing D1 connection');
    // No explicit cleanup needed for D1
  }
}

export { D1Store as DefaultStorage };
