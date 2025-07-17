import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions } from '@lancedb/lancedb';
import type { MastraMessageContentV2 } from '@mastra/core/agent';
import { MessageList } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import type { MastraMessageV1, MastraMessageV2, StorageThreadType, TraceType } from '@mastra/core/memory';
import {
  MastraStorage,
  TABLE_EVALS,
  TABLE_MESSAGES,
  TABLE_THREADS,
} from '@mastra/core/storage';
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
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';
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
      }
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
    try {
      if (!this.lanceClient) {
        throw new Error('LanceDB client not initialized. Call LanceStorage.create() first.');
      }
      if (!tableName) {
        throw new Error('tableName is required for batchInsert.');
      }
      if (!records || records.length === 0) {
        throw new Error('records array is required and cannot be empty for batchInsert.');
      }
    } catch (validationError: any) {
      throw new MastraError(
        {
          id: 'STORAGE_LANCE_STORAGE_BATCH_INSERT_INVALID_ARGS',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
          text: validationError.message,
          details: { tableName },
        },
        validationError,
      );
    }

    try {
      const table = await this.lanceClient.openTable(tableName);

      const primaryId = getPrimaryKeys(tableName as TABLE_NAMES);

      const processedRecords = records.map(record => {
        const processedRecord = { ...record };

        // Convert values based on schema type
        for (const key in processedRecord) {
          // Skip null/undefined values
          if (processedRecord[key] == null) continue;

          if (
            processedRecord[key] !== null &&
            typeof processedRecord[key] === 'object' &&
            !(processedRecord[key] instanceof Date)
          ) {
            processedRecord[key] = JSON.stringify(processedRecord[key]);
          }
        }

        return processedRecord;
      });

      await table.mergeInsert(primaryId).whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(processedRecords);
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'STORAGE_LANCE_STORAGE_BATCH_INSERT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async load({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, any> }): Promise<any> {
    return this.stores.operations.load({ tableName, keys });
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    try {
      const thread = await this.load({ tableName: TABLE_THREADS, keys: { id: threadId } });

      if (!thread) {
        return null;
      }

      return {
        ...thread,
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.updatedAt),
      }
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_THREAD_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    try {
      const table = await this.lanceClient.openTable(TABLE_THREADS);
      // fetches all threads with the given resourceId
      const query = table.query().where(`\`resourceId\` = '${resourceId}'`);

      const records = await query.toArray();
      return processResultWithTypeConversion(
        records,
        await getTableSchema({ tableName: TABLE_THREADS, client: this.lanceClient }),
      ) as StorageThreadType[];
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_THREADS_BY_RESOURCE_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  /**
   * Saves a thread to the database. This function doesn't overwrite existing threads.
   * @param thread - The thread to save
   * @returns The saved thread
   */
  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    try {
      const record = { ...thread, metadata: JSON.stringify(thread.metadata) };
      const table = await this.lanceClient.openTable(TABLE_THREADS);
      await table.add([record], { mode: 'append' });

      return thread;
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_SAVE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
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
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Get current state atomically
        const current = await this.getThreadById({ threadId: id });
        if (!current) {
          throw new Error(`Thread with id ${id} not found`);
        }

        // Merge metadata
        const mergedMetadata = { ...current.metadata, ...metadata };

        // Update atomically
        const record = {
          id,
          title,
          metadata: JSON.stringify(mergedMetadata),
          updatedAt: new Date().getTime()
        };

        const table = await this.lanceClient.openTable(TABLE_THREADS);
        await table.mergeInsert('id')
          .whenMatchedUpdateAll()
          .whenNotMatchedInsertAll()
          .execute([record]);

        const updatedThread = await this.getThreadById({ threadId: id });
        if (!updatedThread) {
          throw new Error(`Failed to retrieve updated thread ${id}`);
        }
        return updatedThread;

      } catch (error: any) {
        if (error.message?.includes('Commit conflict') && attempt < maxRetries - 1) {
          // Wait with exponential backoff before retrying
          const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // If it's not a commit conflict or we've exhausted retries, throw the error
        throw new MastraError(
          {
            id: 'LANCE_STORE_UPDATE_THREAD_FAILED',
            domain: ErrorDomain.STORAGE,
            category: ErrorCategory.THIRD_PARTY,
          },
          error,
        );
      }
    }

    // This should never be reached, but just in case
    throw new MastraError(
      {
        id: 'LANCE_STORE_UPDATE_THREAD_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      new Error('All retries exhausted'),
    );
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    try {
      // Delete the thread
      const table = await this.lanceClient.openTable(TABLE_THREADS);
      await table.delete(`id = '${threadId}'`);

      // Delete all messages with the matching thread_id
      const messagesTable = await this.lanceClient.openTable(TABLE_MESSAGES);
      await messagesTable.delete(`thread_id = '${threadId}'`);
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_DELETE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
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
    try {
      if (threadConfig) {
        throw new Error('ThreadConfig is not supported by LanceDB storage');
      }
      const limit = this.resolveMessageLimit({ last: selectBy?.last, defaultLimit: Number.MAX_SAFE_INTEGER });
      const table = await this.lanceClient.openTable(TABLE_MESSAGES);

      let allRecords: any[] = [];

      // Handle selectBy.include for cross-thread context retrieval
      if (selectBy?.include && selectBy.include.length > 0) {
        // Get all unique thread IDs from include items
        const threadIds = [...new Set(selectBy.include.map(item => item.threadId))];

        // Fetch all messages from all relevant threads
        for (const threadId of threadIds) {
          const threadQuery = table.query().where(`thread_id = '${threadId}'`);
          let threadRecords = await threadQuery.toArray();
          allRecords.push(...threadRecords);
        }
      } else {
        // Regular single-thread query
        let query = table.query().where(`\`thread_id\` = '${threadId}'`);
        allRecords = await query.toArray();
      }

      // Sort the records chronologically
      allRecords.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB; // Ascending order
      });

      // Process the include.withPreviousMessages and include.withNextMessages if specified
      if (selectBy?.include && selectBy.include.length > 0) {
        allRecords = this.processMessagesWithContext(allRecords, selectBy.include);
      }

      // If we're fetching the last N messages, take only the last N after sorting
      if (limit !== Number.MAX_SAFE_INTEGER) {
        allRecords = allRecords.slice(-limit);
      }

      const messages = processResultWithTypeConversion(allRecords, await getTableSchema({ tableName: TABLE_MESSAGES, client: this.lanceClient }));
      const normalized = messages.map((msg: any) => {
        const { thread_id, ...rest } = msg;
        return {
          ...rest,
          threadId: thread_id,
          content:
            typeof msg.content === 'string'
              ? (() => {
                try {
                  return JSON.parse(msg.content);
                } catch {
                  return msg.content;
                }
              })()
              : msg.content,
        };
      });
      const list = new MessageList({ threadId, resourceId }).add(normalized, 'memory');
      if (format === 'v2') return list.get.all.v2();
      return list.get.all.v1();
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: undefined | 'v1' } | { messages: MastraMessageV2[]; format: 'v2' },
  ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    try {
      const { messages, format = 'v1' } = args;
      if (messages.length === 0) {
        return [];
      }

      const threadId = messages[0]?.threadId;

      if (!threadId) {
        throw new Error('Thread ID is required');
      }

      // Validate all messages before saving
      for (const message of messages) {
        if (!message.id) {
          throw new Error('Message ID is required');
        }
        if (!message.threadId) {
          throw new Error('Thread ID is required for all messages');
        }
        if (message.resourceId === null || message.resourceId === undefined) {
          throw new Error('Resource ID cannot be null or undefined');
        }
        if (!message.content) {
          throw new Error('Message content is required');
        }
      }

      const transformedMessages = messages.map((message: MastraMessageV2 | MastraMessageV1) => {
        const { threadId, type, ...rest } = message;
        return {
          ...rest,
          thread_id: threadId,
          type: type ?? 'v2',
          content: JSON.stringify(message.content),
        };
      });

      const table = await this.lanceClient.openTable(TABLE_MESSAGES);
      await table.mergeInsert('id').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(transformedMessages);

      // Update the thread's updatedAt timestamp
      const threadsTable = await this.lanceClient.openTable(TABLE_THREADS);
      const currentTime = new Date().getTime();
      const updateRecord = { id: threadId, updatedAt: currentTime };
      await threadsTable.mergeInsert('id').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute([updateRecord]);

      const list = new MessageList().add(messages, 'memory');
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_SAVE_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async saveTrace(args: { trace: TraceType }): Promise<TraceType> {
    return (this.stores as any).traces.saveTrace(args);
  }

  async getTraceById(args: { traceId: string }): Promise<TraceType> {
    return (this.stores as any).traces.getTraceById(args);
  }

  async getTraces(args: { name?: string; scope?: string; page: number; perPage: number; attributes?: Record<string, string>; }): Promise<Trace[]> {
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

  async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page?: number;
    perPage?: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    try {
      const { resourceId, page = 0, perPage = 10 } = args;
      const table = await this.lanceClient.openTable(TABLE_THREADS);

      // Get total count
      const total = await table.countRows(`\`resourceId\` = '${resourceId}'`);

      // Get paginated results
      const query = table.query().where(`\`resourceId\` = '${resourceId}'`);
      const offset = page * perPage;
      query.limit(perPage);
      if (offset > 0) {
        query.offset(offset);
      }

      const records = await query.toArray();

      // Sort by updatedAt descending (most recent first)
      records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      const schema = await getTableSchema({ tableName: TABLE_THREADS, client: this.lanceClient });
      const threads = records.map(record =>
        processResultWithTypeConversion(record, schema)
      ) as StorageThreadType[];

      return {
        threads,
        total,
        page,
        perPage,
        hasMore: total > (page + 1) * perPage,
      };
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async getMessagesPaginated(
    args: StorageGetMessagesArg & { format?: 'v1' | 'v2' },
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    try {
      const {
        threadId,
        resourceId,
        selectBy,
        format = 'v1',
      } = args;

      if (!threadId) {
        throw new Error('Thread ID is required for getMessagesPaginated');
      }

      // Extract pagination and dateRange from selectBy.pagination
      const page = selectBy?.pagination?.page ?? 0;
      const perPage = selectBy?.pagination?.perPage ?? 10;
      const dateRange = selectBy?.pagination?.dateRange;
      const fromDate = dateRange?.start;
      const toDate = dateRange?.end;

      const table = await this.lanceClient.openTable(TABLE_MESSAGES);
      const messages: any[] = [];

      // Handle selectBy.include first (before pagination)
      if (selectBy?.include && Array.isArray(selectBy.include)) {
        // Get all unique thread IDs from include items
        const threadIds = [...new Set(selectBy.include.map(item => item.threadId))];

        // Fetch all messages from all relevant threads
        const allThreadMessages: any[] = [];
        for (const threadId of threadIds) {
          const threadQuery = table.query().where(`thread_id = '${threadId}'`);
          let threadRecords = await threadQuery.toArray();

          // Apply date filtering in JS for context
          if (fromDate) threadRecords = threadRecords.filter(m => m.createdAt >= fromDate.getTime());
          if (toDate) threadRecords = threadRecords.filter(m => m.createdAt <= toDate.getTime());

          allThreadMessages.push(...threadRecords);
        }

        // Sort all messages by createdAt
        allThreadMessages.sort((a, b) => a.createdAt - b.createdAt);

        // Apply processMessagesWithContext to the combined array
        const contextMessages = this.processMessagesWithContext(
          allThreadMessages,
          selectBy.include,
        );
        messages.push(...contextMessages);
      }

      // Build query conditions for the main thread
      const conditions: string[] = [`thread_id = '${threadId}'`];
      if (resourceId) {
        conditions.push(`\`resourceId\` = '${resourceId}'`);
      }
      if (fromDate) {
        conditions.push(`\`createdAt\` >= ${fromDate.getTime()}`);
      }
      if (toDate) {
        conditions.push(`\`createdAt\` <= ${toDate.getTime()}`);
      }

      // Get total count (excluding already included messages)
      let total = 0;
      if (conditions.length > 0) {
        total = await table.countRows(conditions.join(' AND '));
      } else {
        total = await table.countRows();
      }

      // If no messages and no included messages, return empty result
      if (total === 0 && messages.length === 0) {
        return {
          messages: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      // Fetch paginated messages (excluding already included ones)
      const excludeIds = messages.map(m => m.id);
      let selectedMessages: any[] = [];

      if (selectBy?.last && selectBy.last > 0) {
        // Handle selectBy.last: get last N messages for the main thread
        const query = table.query();
        if (conditions.length > 0) {
          query.where(conditions.join(' AND '));
        }
        let records = await query.toArray();
        records = records.sort((a, b) => a.createdAt - b.createdAt);

        // Exclude already included messages
        if (excludeIds.length > 0) {
          records = records.filter(m => !excludeIds.includes(m.id));
        }

        selectedMessages = records.slice(-selectBy.last);
      } else {
        // Regular pagination
        const query = table.query();
        if (conditions.length > 0) {
          query.where(conditions.join(' AND '));
        }
        let records = await query.toArray();
        records = records.sort((a, b) => a.createdAt - b.createdAt);

        // Exclude already included messages
        if (excludeIds.length > 0) {
          records = records.filter(m => !excludeIds.includes(m.id));
        }

        selectedMessages = records.slice(page * perPage, (page + 1) * perPage);
      }

      // Merge all messages and deduplicate
      const allMessages = [...messages, ...selectedMessages];
      const seen = new Set();
      const dedupedMessages = allMessages.filter(m => {
        const key = `${m.id}:${m.thread_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Convert to correct format (v1/v2)
      const formattedMessages = dedupedMessages.map((msg: any) => {
        const { thread_id, ...rest } = msg;
        return {
          ...rest,
          threadId: thread_id,
          content:
            typeof msg.content === 'string'
              ? (() => {
                try {
                  return JSON.parse(msg.content);
                } catch {
                  return msg.content;
                }
              })()
              : msg.content,
        };
      });

      const list = new MessageList().add(formattedMessages, 'memory');
      return {
        messages: format === 'v2' ? list.get.all.v2() : list.get.all.v1(),
        total: total, // Total should be the count of messages matching the filters
        page,
        perPage,
        hasMore: total > (page + 1) * perPage,
      };
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_MESSAGES_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async updateMessages(_args: {
    messages: Partial<Omit<MastraMessageV2, 'createdAt'>> &
    {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    }[];
  }): Promise<MastraMessageV2[]> {
    this.logger.error('updateMessages is not yet implemented in LanceStore');
    throw new Error('Method not implemented');
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

  async getEvals(
    options: {
      agentName?: string;
      type?: 'test' | 'live';
      page?: number;
      perPage?: number;
      fromDate?: Date;
      toDate?: Date;
      dateRange?: { start?: Date; end?: Date };
    }
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
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


      const evals = records.sort((a, b) => b.created_at - a.created_at).map(record => {
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
