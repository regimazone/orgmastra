import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions } from '@lancedb/lancedb';
import type { MastraMessageContentV2 } from '@mastra/core/agent';
import { MessageList } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import type { MastraMessageV1, MastraMessageV2, StorageThreadType, TraceType } from '@mastra/core/memory';
import { MastraStorage, TABLE_EVALS, TABLE_MESSAGES, TABLE_RESOURCES, TABLE_THREADS } from '@mastra/core/storage';
import type {
  TABLE_NAMES,
  PaginationInfo,
  StorageGetMessagesArg,
  StorageColumn,
  EvalRow,
  WorkflowRuns,
  StoragePagination,
  StorageDomains,
  StorageGetTracesPaginatedArg,
  StorageResourceType,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { StoreMemoryLance } from './domains/memory';
import { StoreOperationsLance } from './domains/operations';
import { StoreScoresLance } from './domains/scores';
import { StoreTracesLance } from './domains/traces';
import { getPrimaryKeys, getTableSchema, processResultWithTypeConversion } from './domains/utils';
import { StoreWorkflowsLance } from './domains/workflows';

export class LanceStorage extends MastraStorage {
  stores: StorageDomains;
  private lanceClient!: Connection;
  /**
   * Creates a new instance of LanceStorage
   * @param uri The URI to connect to LanceDB
   * @param options connection options
   *
   * Usage:
   *
   * Connect to a local database
   * ```ts
   * const store = await LanceStorage.create('/path/to/db');
   * ```
   *
   * Connect to a LanceDB cloud database
   * ```ts
   * const store = await LanceStorage.create('db://host:port');
   * ```
   *
   * Connect to a cloud database
   * ```ts
   * const store = await LanceStorage.create('s3://bucket/db', { storageOptions: { timeout: '60s' } });
   * ```
   */
  public static async create(name: string, uri: string, options?: ConnectionOptions): Promise<LanceStorage> {
    const instance = new LanceStorage(name);
    try {
      instance.lanceClient = await connect(uri, options);
      const operations = new StoreOperationsLance({ client: instance.lanceClient });
      instance.stores = {
        operations: new StoreOperationsLance({ client: instance.lanceClient }),
        workflows: new StoreWorkflowsLance({ client: instance.lanceClient }),
        traces: new StoreTracesLance({ client: instance.lanceClient, operations }),
        scores: new StoreScoresLance({ client: instance.lanceClient }),
        memory: new StoreMemoryLance({ client: instance.lanceClient, operations }),
      } as any;
      return instance;
    } catch (e: any) {
      throw new MastraError(
        {
          id: 'STORAGE_LANCE_STORAGE_CONNECT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to connect to LanceDB: ${e.message || e}`,
          details: { uri, optionsProvided: !!options },
        },
        e,
      );
    }
  }

  /**
   * @internal
   * Private constructor to enforce using the create factory method
   */
  private constructor(name: string) {
    super({ name });
    const operations = new StoreOperationsLance({ client: this.lanceClient });

    this.stores = {
      operations: new StoreOperationsLance({ client: this.lanceClient }),
      workflows: new StoreWorkflowsLance({ client: this.lanceClient }),
      traces: new StoreTracesLance({ client: this.lanceClient, operations }),
      scores: new StoreScoresLance({ client: this.lanceClient }),
    } as unknown as StorageDomains;
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

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.dropTable({ tableName });
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

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.clearTable({ tableName });
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    return this.stores.operations.insert({ tableName, record });
  }

  async batchInsert({ tableName, records }: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    return this.stores.operations.batchInsert({ tableName, records });
  }

  async load({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, any> }): Promise<any> {
    return this.stores.operations.load({ tableName, keys });
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    return this.stores.memory.getThreadById({ threadId });
  }

  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    return this.stores.memory.getThreadsByResourceId({ resourceId });
  }

  /**
   * Saves a thread to the database. This function doesn't overwrite existing threads.
   * @param thread - The thread to save
   * @returns The saved thread
   */
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

  public get supports() {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: true,
      createTable: true,
    };
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
   * Processes messages to include context messages based on withPreviousMessages and withNextMessages
   * @param records - The sorted array of records to process
   * @param include - The array of include specifications with context parameters
   * @returns The processed array with context messages included
   */
  private processMessagesWithContext(
    records: any[],
    include: { id: string; withPreviousMessages?: number; withNextMessages?: number }[],
  ): any[] {
    const messagesWithContext = include.filter(item => item.withPreviousMessages || item.withNextMessages);

    if (messagesWithContext.length === 0) {
      return records;
    }

    // Create a map of message id to index in the sorted array for quick lookup
    const messageIndexMap = new Map<string, number>();
    records.forEach((message, index) => {
      messageIndexMap.set(message.id, index);
    });

    // Keep track of additional indices to include
    const additionalIndices = new Set<number>();

    for (const item of messagesWithContext) {
      const messageIndex = messageIndexMap.get(item.id);

      if (messageIndex !== undefined) {
        // Add previous messages if requested
        if (item.withPreviousMessages) {
          const startIdx = Math.max(0, messageIndex - item.withPreviousMessages);
          for (let i = startIdx; i < messageIndex; i++) {
            additionalIndices.add(i);
          }
        }

        // Add next messages if requested
        if (item.withNextMessages) {
          const endIdx = Math.min(records.length - 1, messageIndex + item.withNextMessages);
          for (let i = messageIndex + 1; i <= endIdx; i++) {
            additionalIndices.add(i);
          }
        }
      }
    }

    // If we need to include additional messages, create a new set of records
    if (additionalIndices.size === 0) {
      return records;
    }

    // Get IDs of the records that matched the original query
    const originalMatchIds = new Set(include.map(item => item.id));

    // Create a set of all indices we need to include
    const allIndices = new Set<number>();

    // Add indices of originally matched messages
    records.forEach((record, index) => {
      if (originalMatchIds.has(record.id)) {
        allIndices.add(index);
      }
    });

    // Add the additional context message indices
    additionalIndices.forEach(index => {
      allIndices.add(index);
    });

    // Create a new filtered array with only the required messages
    // while maintaining chronological order
    return Array.from(allIndices)
      .sort((a, b) => a - b)
      .map(index => records[index]);
  }

  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages({
    threadId,
    resourceId,
    selectBy,
    format,
    threadConfig,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    return this.stores.memory.getMessages({ threadId, resourceId, selectBy, format, threadConfig });
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: undefined | 'v1' } | { messages: MastraMessageV2[]; format: 'v2' },
  ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    return this.stores.memory.saveMessages(args);
  }

  async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page: number;
    perPage: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    return this.stores.memory.getThreadsByResourceIdPaginated(args);
  }

  async getMessagesPaginated(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' },
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    return this.stores.memory.getMessagesPaginated(args);
  }

  async updateMessages(_args: {
    messages: Partial<Omit<MastraMessageV2, 'createdAt'>> &
      {
        id: string;
        content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
      }[];
  }): Promise<MastraMessageV2[]> {
    return this.stores.memory.updateMessages(_args);
  }

  async getTraceById(args: { traceId: string }): Promise<TraceType> {
    return (this.stores as any).traces.getTraceById(args);
  }

  async getTraces(args: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
  }): Promise<Trace[]> {
    return (this.stores as any).traces.getTraces(args);
  }

  async getTracesPaginated(args: StorageGetTracesPaginatedArg): Promise<PaginationInfo & { traces: Trace[] }> {
    return (this.stores as any).traces.getTracesPaginated(args);
  }

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    try {
      const table = await this.lanceClient.openTable(TABLE_EVALS);
      const query = table.query().where(`agent_name = '${agentName}'`);
      const records = await query.toArray();

      // Filter by type if specified
      let filteredRecords = records;
      if (type === 'live') {
        // Live evals have test_info as null
        filteredRecords = records.filter(record => record.test_info === null);
      } else if (type === 'test') {
        // Test evals have test_info as a JSON string
        filteredRecords = records.filter(record => record.test_info !== null);
      }

      return filteredRecords.map(record => {
        return {
          id: record.id,
          input: record.input,
          output: record.output,
          agentName: record.agent_name,
          metricName: record.metric_name,
          result: JSON.parse(record.result),
          instructions: record.instructions,
          testInfo: record.test_info ? JSON.parse(record.test_info) : null,
          globalRunId: record.global_run_id,
          runId: record.run_id,
          createdAt: new Date(record.created_at).toString(),
        };
      }) as EvalRow[];
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_EVALS_BY_AGENT_NAME_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName },
        },
        error,
      );
    }
  }

  async getWorkflowRuns(args?: {
    namespace?: string;
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowRuns> {
    return this.stores.workflows.getWorkflowRuns(args);
  }

  async getWorkflowRunById(args: { runId: string; workflowName?: string }): Promise<{
    workflowName: string;
    runId: string;
    snapshot: any;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    return this.stores.workflows.getWorkflowRunById(args);
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

  async getScoreById({ id: _id }: { id: string }): Promise<ScoreRowData | null> {
    return this.stores.scores.getScoreById({ id: _id });
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

  async saveScore(_score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    return this.stores.scores.saveScore(_score);
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

  async getEvals(options: {
    agentName?: string;
    type?: 'test' | 'live';
    page?: number;
    perPage?: number;
    fromDate?: Date;
    toDate?: Date;
    dateRange?: { start?: Date; end?: Date };
  }): Promise<PaginationInfo & { evals: EvalRow[] }> {
    try {
      const table = await this.lanceClient.openTable(TABLE_EVALS);

      // Build combined where clause
      const conditions: string[] = [];

      if (options.agentName) {
        conditions.push(`agent_name = '${options.agentName}'`);
      }

      // Apply type filtering
      if (options.type === 'live') {
        conditions.push('length(test_info) = 0');
      } else if (options.type === 'test') {
        conditions.push('length(test_info) > 0');
      }

      // Apply date filtering
      const startDate = options.dateRange?.start || options.fromDate;
      const endDate = options.dateRange?.end || options.toDate;

      if (startDate) {
        conditions.push(`\`created_at\` >= ${startDate.getTime()}`);
      }

      if (endDate) {
        conditions.push(`\`created_at\` <= ${endDate.getTime()}`);
      }

      // Get total count with the same conditions
      let total = 0;
      if (conditions.length > 0) {
        total = await table.countRows(conditions.join(' AND '));
      } else {
        total = await table.countRows();
      }

      // Build query for fetching records
      const query = table.query();

      // Apply combined where clause if we have conditions
      if (conditions.length > 0) {
        const whereClause = conditions.join(' AND ');
        query.where(whereClause);
      }

      const records = await query.toArray();

      const evals = records
        .sort((a, b) => b.created_at - a.created_at)
        .map(record => {
          return {
            id: record.id,
            input: record.input,
            output: record.output,
            agentName: record.agent_name,
            metricName: record.metric_name,
            result: JSON.parse(record.result),
            instructions: record.instructions,
            testInfo: record.test_info ? JSON.parse(record.test_info) : null,
            globalRunId: record.global_run_id,
            runId: record.run_id,
            createdAt: new Date(record.created_at).toISOString(),
          };
        }) as EvalRow[];

      // Apply pagination after filtering
      const page = options.page || 0;
      const perPage = options.perPage || 10;
      const pagedEvals = evals.slice(page * perPage, (page + 1) * perPage);

      return {
        evals: pagedEvals,
        total: total,
        page,
        perPage,
        hasMore: total > (page + 1) * perPage,
      };
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_EVALS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName: options.agentName ?? '' },
        },
        error,
      );
    }
  }
}
