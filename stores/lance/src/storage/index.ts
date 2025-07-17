import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions, SchemaLike, FieldLike } from '@lancedb/lancedb';
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
  TABLE_TRACES,
  TABLE_WORKFLOW_SNAPSHOT,
} from '@mastra/core/storage';
import type {
  TABLE_NAMES,
  PaginationInfo,
  StorageGetMessagesArg,
  StorageGetTracesArg,
  StorageColumn,
  EvalRow,
  WorkflowRun,
  WorkflowRuns,
  StoragePagination,
  StorageDomains,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { DataType } from 'apache-arrow';
import { Utf8, Int32, Float32, Binary, Schema, Field, Float64 } from 'apache-arrow';
import { getPrimaryKeys, getTableSchema, processResultWithTypeConversion, validateKeyTypes } from './domains/utils';
import { StoreOperationsLance } from './domains/operations';



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
      instance.stores = {
        operations: new StoreOperationsLance({ client: instance.lanceClient }),
      } as unknown as StorageDomains;
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
    this.stores = {
      operations: new StoreOperationsLance({ client: this.lanceClient }),
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
    try {
      const record = { id, title, metadata: JSON.stringify(metadata) };
      const table = await this.lanceClient.openTable(TABLE_THREADS);
      await table.mergeInsert('id').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute([record]);

      const query = table.query().where(`id = '${id}'`);

      const records = await query.toArray();
      return processResultWithTypeConversion(
        records[0],
        await getTableSchema({ tableName: TABLE_THREADS, client: this.lanceClient }),
      ) as StorageThreadType;
    } catch (error: any) {
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

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    try {
      const table = await this.lanceClient.openTable(TABLE_THREADS);
      await table.delete(`id = '${threadId}'`);
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
      let query = table.query().where(`\`threadId\` = '${threadId}'`);

      // Apply selectBy filters if provided
      if (selectBy) {
        // Handle 'include' to fetch specific messages
        if (selectBy.include && selectBy.include.length > 0) {
          const includeIds = selectBy.include.map(item => item.id);
          // Add additional query to include specific message IDs
          // This will be combined with the threadId filter
          const includeClause = includeIds.map(id => `\`id\` = '${id}'`).join(' OR ');
          query = query.where(`(\`threadId\` = '${threadId}' OR (${includeClause}))`);

          // Note: The surrounding messages (withPreviousMessages/withNextMessages) will be
          // handled after we retrieve the results
        }
      }

      // Fetch all records matching the query
      let records = await query.toArray();

      // Sort the records chronologically
      records.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB; // Ascending order
      });

      // Process the include.withPreviousMessages and include.withNextMessages if specified
      if (selectBy?.include && selectBy.include.length > 0) {
        records = this.processMessagesWithContext(records, selectBy.include);
      }

      // If we're fetching the last N messages, take only the last N after sorting
      if (limit !== Number.MAX_SAFE_INTEGER) {
        records = records.slice(-limit);
      }

      const messages = processResultWithTypeConversion(records, await getTableSchema({ tableName: TABLE_MESSAGES, client: this.lanceClient }));
      const normalized = messages.map((msg: MastraMessageV2 | MastraMessageV1) => ({
        ...msg,
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
      }));
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

      const transformedMessages = messages.map((message: MastraMessageV2 | MastraMessageV1) => ({
        ...message,
        content: JSON.stringify(message.content),
      }));

      const table = await this.lanceClient.openTable(TABLE_MESSAGES);
      await table.mergeInsert('id').whenMatchedUpdateAll().whenNotMatchedInsertAll().execute(transformedMessages);

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

  async saveTrace({ trace }: { trace: TraceType }): Promise<TraceType> {
    try {
      const table = await this.lanceClient.openTable(TABLE_TRACES);
      const record = {
        ...trace,
        attributes: JSON.stringify(trace.attributes),
        status: JSON.stringify(trace.status),
        events: JSON.stringify(trace.events),
        links: JSON.stringify(trace.links),
        other: JSON.stringify(trace.other),
      };
      await table.add([record], { mode: 'append' });

      return trace;
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_SAVE_TRACE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async getTraceById({ traceId }: { traceId: string }): Promise<TraceType> {
    try {
      const table = await this.lanceClient.openTable(TABLE_TRACES);
      const query = table.query().where(`id = '${traceId}'`);
      const records = await query.toArray();
      return processResultWithTypeConversion(records[0], await getTableSchema({ tableName: TABLE_TRACES, client: this.lanceClient })) as TraceType;
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_TRACE_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async getTraces({
    name,
    scope,
    page = 1,
    perPage = 10,
    attributes,
  }: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
  }): Promise<TraceType[]> {
    try {
      const table = await this.lanceClient.openTable(TABLE_TRACES);
      const query = table.query();

      if (name) {
        query.where(`name = '${name}'`);
      }

      if (scope) {
        query.where(`scope = '${scope}'`);
      }

      if (attributes) {
        query.where(`attributes = '${JSON.stringify(attributes)}'`);
      }

      // Calculate offset based on page and perPage
      const offset = (page - 1) * perPage;

      // Apply limit for pagination
      query.limit(perPage);

      // Apply offset if greater than 0
      if (offset > 0) {
        query.offset(offset);
      }

      const records = await query.toArray();
      return records.map(record => {
        return {
          ...record,
          attributes: JSON.parse(record.attributes),
          status: JSON.parse(record.status),
          events: JSON.parse(record.events),
          links: JSON.parse(record.links),
          other: JSON.parse(record.other),
          startTime: new Date(record.startTime),
          endTime: new Date(record.endTime),
          createdAt: new Date(record.createdAt),
        };
      }) as TraceType[];
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_TRACES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { name: name ?? '', scope: scope ?? '' },
        },
        error,
      );
    }
  }

  async saveEvals({ evals }: { evals: EvalRow[] }): Promise<EvalRow[]> {
    try {
      const table = await this.lanceClient.openTable(TABLE_EVALS);
      const transformedEvals = evals.map(evalRecord => ({
        input: evalRecord.input,
        output: evalRecord.output,
        agent_name: evalRecord.agentName,
        metric_name: evalRecord.metricName,
        result: JSON.stringify(evalRecord.result),
        instructions: evalRecord.instructions,
        test_info: JSON.stringify(evalRecord.testInfo),
        global_run_id: evalRecord.globalRunId,
        run_id: evalRecord.runId,
        created_at: new Date(evalRecord.createdAt).getTime(),
      }));

      await table.add(transformedEvals, { mode: 'append' });
      return evals;
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_SAVE_EVALS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    try {
      if (type) {
        this.logger.warn('Type is not implemented yet in LanceDB storage');
      }
      const table = await this.lanceClient.openTable(TABLE_EVALS);
      const query = table.query().where(`agent_name = '${agentName}'`);
      const records = await query.toArray();
      return records.map(record => {
        return {
          id: record.id,
          input: record.input,
          output: record.output,
          agentName: record.agent_name,
          metricName: record.metric_name,
          result: JSON.parse(record.result),
          instructions: record.instructions,
          testInfo: JSON.parse(record.test_info),
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

  private parseWorkflowRun(row: any): WorkflowRun {
    let parsedSnapshot: WorkflowRunState | string = row.snapshot as string;
    if (typeof parsedSnapshot === 'string') {
      try {
        parsedSnapshot = JSON.parse(row.snapshot as string) as WorkflowRunState;
      } catch (e) {
        // If parsing fails, return the raw snapshot string
        console.warn(`Failed to parse snapshot for workflow ${row.workflow_name}: ${e}`);
      }
    }

    return {
      workflowName: row.workflow_name,
      runId: row.run_id,
      snapshot: parsedSnapshot,
      createdAt: this.ensureDate(row.createdAt)!,
      updatedAt: this.ensureDate(row.updatedAt)!,
      resourceId: row.resourceId,
    };
  }

  async getWorkflowRuns(args?: {
    namespace?: string;
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowRuns> {
    try {
      const table = await this.lanceClient.openTable(TABLE_WORKFLOW_SNAPSHOT);
      const query = table.query();

      if (args?.workflowName) {
        query.where(`workflow_name = '${args.workflowName}'`);
      }

      if (args?.fromDate) {
        query.where(`\`createdAt\` >= ${args.fromDate.getTime()}`);
      }

      if (args?.toDate) {
        query.where(`\`createdAt\` <= ${args.toDate.getTime()}`);
      }

      if (args?.limit) {
        query.limit(args.limit);
      }

      if (args?.offset) {
        query.offset(args.offset);
      }

      const records = await query.toArray();
      return {
        runs: records.map(record => this.parseWorkflowRun(record)),
        total: records.length,
      };
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_WORKFLOW_RUNS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { namespace: args?.namespace ?? '', workflowName: args?.workflowName ?? '' },
        },
        error,
      );
    }
  }

  /**
   * Retrieve a single workflow run by its runId.
   * @param args The ID of the workflow run to retrieve
   * @returns The workflow run object or null if not found
   */
  async getWorkflowRunById(args: { runId: string; workflowName?: string }): Promise<{
    workflowName: string;
    runId: string;
    snapshot: any;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    try {
      const table = await this.lanceClient.openTable(TABLE_WORKFLOW_SNAPSHOT);
      let whereClause = `run_id = '${args.runId}'`;
      if (args.workflowName) {
        whereClause += ` AND workflow_name = '${args.workflowName}'`;
      }
      const query = table.query().where(whereClause);
      const records = await query.toArray();
      if (records.length === 0) return null;
      const record = records[0];
      return this.parseWorkflowRun(record);
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_GET_WORKFLOW_RUN_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { runId: args.runId, workflowName: args.workflowName ?? '' },
        },
        error,
      );
    }
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
    try {
      const table = await this.lanceClient.openTable(TABLE_WORKFLOW_SNAPSHOT);

      // Try to find the existing record
      const query = table.query().where(`workflow_name = '${workflowName}' AND run_id = '${runId}'`);
      const records = await query.toArray();
      let createdAt: number;
      const now = Date.now();

      if (records.length > 0) {
        createdAt = records[0].createdAt ?? now;
      } else {
        createdAt = now;
      }

      const record = {
        workflow_name: workflowName,
        run_id: runId,
        snapshot: JSON.stringify(snapshot),
        createdAt,
        updatedAt: now,
      };

      await table
        .mergeInsert(['workflow_name', 'run_id'])
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute([record]);
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_PERSIST_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }
  async loadWorkflowSnapshot({
    workflowName,
    runId,
  }: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    try {
      const table = await this.lanceClient.openTable(TABLE_WORKFLOW_SNAPSHOT);
      const query = table.query().where(`workflow_name = '${workflowName}' AND run_id = '${runId}'`);
      const records = await query.toArray();
      return records.length > 0 ? JSON.parse(records[0].snapshot) : null;
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'LANCE_STORE_LOAD_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }

  async getTracesPaginated(_args: StorageGetTracesArg): Promise<PaginationInfo & { traces: Trace[] }> {
    throw new MastraError(
      {
        id: 'LANCE_STORE_GET_TRACES_PAGINATED_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      'Method not implemented.',
    );
  }

  async getThreadsByResourceIdPaginated(_args: {
    resourceId: string;
    page?: number;
    perPage?: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    throw new MastraError(
      {
        id: 'LANCE_STORE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      'Method not implemented.',
    );
  }

  async getMessagesPaginated(
    _args: StorageGetMessagesArg,
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    throw new MastraError(
      {
        id: 'LANCE_STORE_GET_MESSAGES_PAGINATED_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      'Method not implemented.',
    );
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
    throw new MastraError({
      id: 'LANCE_STORAGE_METHOD_NOT_IMPLEMENTED',
      text: 'getScoreById method is not implemented for LanceStorage',
      domain: ErrorDomain.STORAGE,
      category: ErrorCategory.USER,
    });
  }

  async getScoresByScorerId({
    scorerId: _scorerId,
    pagination: _pagination,
  }: {
    scorerId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    throw new MastraError({
      id: 'LANCE_STORAGE_METHOD_NOT_IMPLEMENTED',
      text: 'getScoresByScorerId method is not implemented for LanceStorage',
      domain: ErrorDomain.STORAGE,
      category: ErrorCategory.USER,
    });
  }

  async saveScore(_score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    throw new MastraError({
      id: 'LANCE_STORAGE_METHOD_NOT_IMPLEMENTED',
      text: 'saveScore method is not implemented for LanceStorage',
      domain: ErrorDomain.STORAGE,
      category: ErrorCategory.USER,
    });
  }

  async getScoresByRunId({
    runId: _runId,
    pagination: _pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    throw new MastraError({
      id: 'LANCE_STORAGE_METHOD_NOT_IMPLEMENTED',
      text: 'getScoresByRunId method is not implemented for LanceStorage',
      domain: ErrorDomain.STORAGE,
      category: ErrorCategory.USER,
    });
  }

  async getScoresByEntityId({
    entityId: _entityId,
    entityType: _entityType,
    pagination: _pagination,
  }: {
    pagination: StoragePagination;
    entityId: string;
    entityType: string;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    throw new MastraError({
      id: 'LANCE_STORAGE_METHOD_NOT_IMPLEMENTED',
      text: 'getScoresByEntityId method is not implemented for LanceStorage',
      domain: ErrorDomain.STORAGE,
      category: ErrorCategory.USER,
    });
  }
}
