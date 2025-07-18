import type { MastraMessageContentV2, MastraMessageV2 } from '@mastra/core/agent';
import type { ScoreRowData } from '@mastra/core/eval';
import type { MastraMessageV1, StorageThreadType } from '@mastra/core/memory';
import { MastraStorage } from '@mastra/core/storage';
import type {
  EvalRow,
  PaginationArgs,
  PaginationInfo,
  StorageColumn,
  StorageGetMessagesArg,
  StorageGetTracesArg,
  StorageResourceType,
  TABLE_NAMES,
  WorkflowRun,
  WorkflowRuns,
  StoragePagination,
  StorageDomains,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { MongoClientOptions } from 'mongodb';
import { LegacyEvalsMongoDB } from './domains/legacy-evals';
import { MemoryMongoDB } from './domains/memory';
import { StoreOperationsMongoDB } from './domains/operations';
import { ScoresMongoDB } from './domains/scores';
import { TracesMongoDB } from './domains/traces';
import { WorkflowsMongoDB } from './domains/workflows';

export interface MongoDBConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class MongoDBStore extends MastraStorage {
  stores: StorageDomains;

  constructor(config: MongoDBConfig) {
    super({ name: 'MongoDBStore' });

    const operations = new StoreOperationsMongoDB({
      url: config.url,
      dbName: config.dbName,
      options: config.options,
    });

    const scores = new ScoresMongoDB({
      url: config.url,
      dbName: config.dbName,
      options: config.options,
      operations,
    });

    const traces = new TracesMongoDB({
      url: config.url,
      dbName: config.dbName,
      options: config.options,
      operations,
    });

    const workflows = new WorkflowsMongoDB({
      url: config.url,
      dbName: config.dbName,
      options: config.options,
      operations,
    });

    const memory = new MemoryMongoDB({
      url: config.url,
      dbName: config.dbName,
      options: config.options,
      operations,
    });

    const legacyEvals = new LegacyEvalsMongoDB({
      url: config.url,
      dbName: config.dbName,
      options: config.options,
      operations,
    });

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
      hasColumn: false, // MongoDB is schemaless
      createTable: false, // MongoDB is schemaless
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

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    await this.stores.operations.insert({ tableName, record });
  }

  async batchInsert({ tableName, records }: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    for (const record of records) {
      await this.stores.operations.insert({ tableName, record });
    }
  }

  async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, any> }): Promise<R | null> {
    return this.stores.operations.load<R>({ tableName, keys });
  }

  // Thread operations
  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    return this.stores.memory.getThreadById({ threadId });
  }

  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    return this.stores.memory.getThreadsByResourceId({ resourceId });
  }

  async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page?: number;
    perPage?: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    return this.stores.memory.getThreadsByResourceIdPaginated({
      resourceId: args.resourceId,
      page: args.page || 0,
      perPage: args.perPage || 100,
    });
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

  // Message operations
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    return this.stores.memory.getMessages(args as any);
  }

  async getMessagesPaginated(args: StorageGetMessagesArg): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    return this.stores.memory.getMessagesPaginated(args);
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(args: any): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    return this.stores.memory.saveMessages(args);
  }

  async updateMessages(args: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraMessageV2[]> {
    return this.stores.memory.updateMessages(args);
  }

  // Resource operations
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

  // Trace operations
  async getTraces(args: {
    name?: string;
    scope?: string;
    page?: number;
    perPage?: number;
    attributes?: Record<string, string>;
    filters?: Record<string, any>;
  } = {}): Promise<Trace[]> {
    return this.stores.traces.getTraces(args);
  }

  async getTracesPaginated(args: StorageGetTracesArg): Promise<PaginationInfo & { traces: Trace[] }> {
    return this.stores.traces.getTracesPaginated(args);
  }

  // Workflow operations
  async getWorkflowRuns(args: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<WorkflowRuns> {
    return this.stores.workflows.getWorkflowRuns(args);
  }

  // Legacy eval operations
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

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    return this.stores.workflows.getWorkflowRunById({ runId, workflowName });
  }

  async close(): Promise<void> {
    return this.stores.operations.close();
  }

  // Score operations
  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    return this.stores.scores.getScoreById({ id });
  }

  async saveScore(score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    return this.stores.scores.saveScore(score);
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

  async getScoresByScorerId({
    scorerId,
    pagination,
  }: {
    scorerId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    return this.stores.scores.getScoresByScorerId({ scorerId, pagination });
  }
}
