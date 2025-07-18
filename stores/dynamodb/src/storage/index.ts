import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MastraMessageContentV2 } from '@mastra/core/agent';
import { MessageList } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import type { StorageThreadType, MastraMessageV2, MastraMessageV1 } from '@mastra/core/memory';

import { MastraStorage, TABLE_TRACES } from '@mastra/core/storage';
import type {
  EvalRow,
  StorageGetMessagesArg,
  WorkflowRun,
  WorkflowRuns,
  TABLE_NAMES,
  StorageGetTracesArg,
  PaginationInfo,
  StorageColumn,
  TABLE_RESOURCES,
  StoragePagination,
  StorageDomains,
  PaginationArgs,
} from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { Service } from 'electrodb';
import { getElectroDbService } from '../entities';
import { LegacyEvalsDynamoDB } from './domains/legacy-evals';
import { StoreOperationsDynamoDB } from './domains/operations';

export interface DynamoDBStoreConfig {
  region?: string;
  tableName: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

type SUPPORTED_TABLE_NAMES = Exclude<TABLE_NAMES, typeof TABLE_RESOURCES>;

// Define a type for our service that allows string indexing
type MastraService = Service<Record<string, any>> & {
  [key: string]: any;
};

// Define the structure for workflow snapshot items retrieved from DynamoDB
interface WorkflowSnapshotDBItem {
  entity: string; // Typically 'workflow_snapshot'
  workflow_name: string;
  run_id: string;
  snapshot: WorkflowRunState; // Should be WorkflowRunState after ElectroDB get attribute processing
  createdAt: string; // ISO Date string
  updatedAt: string; // ISO Date string
  resourceId?: string;
}

export class DynamoDBStore extends MastraStorage {
  private tableName: string;
  private client: DynamoDBDocumentClient;
  private service: MastraService;
  protected hasInitialized: Promise<boolean> | null = null;
  stores: StorageDomains;

  constructor({ name, config }: { name: string; config: DynamoDBStoreConfig }) {
    super({ name });

    // Validate required config
    try {
      if (!config.tableName || typeof config.tableName !== 'string' || config.tableName.trim() === '') {
        throw new Error('DynamoDBStore: config.tableName must be provided and cannot be empty.');
      }
      // Validate tableName characters (basic check)
      if (!/^[a-zA-Z0-9_.-]{3,255}$/.test(config.tableName)) {
        throw new Error(
          `DynamoDBStore: config.tableName "${config.tableName}" contains invalid characters or is not between 3 and 255 characters long.`,
        );
      }

      const dynamoClient = new DynamoDBClient({
        region: config.region || 'us-east-1',
        endpoint: config.endpoint,
        credentials: config.credentials,
      });

      this.tableName = config.tableName;
      this.client = DynamoDBDocumentClient.from(dynamoClient);
      this.service = getElectroDbService(this.client, this.tableName) as MastraService;

      const operations = new StoreOperationsDynamoDB({
        service: this.service,
        tableName: this.tableName,
        client: this.client,
      });

      this.stores = {
        operations,
        legacyEvals: new LegacyEvalsDynamoDB({ service: this.service, tableName: this.tableName }),
      } as any;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_CONSTRUCTOR_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
        },
        error,
      );
    }

    // We're using a single table design with ElectroDB,
    // so we don't need to create multiple tables
  }

  get supports() {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: false,
      createTable: false,
    };
  }

  /**
   * Validates that the required DynamoDB table exists and is accessible.
   * This does not check the table structure - it assumes the table
   * was created with the correct structure via CDK/CloudFormation.
   */
  private async validateTableExists(): Promise<boolean> {
    try {
      const command = new DescribeTableCommand({
        TableName: this.tableName,
      });

      // If the table exists, this call will succeed
      // If the table doesn't exist, it will throw a ResourceNotFoundException
      await this.client.send(command);
      return true;
    } catch (error: any) {
      // If the table doesn't exist, DynamoDB returns a ResourceNotFoundException
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }

      // For other errors (like permissions issues), we should throw
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_VALIDATE_TABLE_EXISTS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName: this.tableName },
        },
        error,
      );
    }
  }

  /**
   * Initialize storage, validating the externally managed table is accessible.
   * For the single-table design, we only validate once that we can access
   * the table that was created via CDK/CloudFormation.
   */
  async init(): Promise<void> {
    if (this.hasInitialized === null) {
      // If no initialization promise exists, create and store it.
      // This assignment ensures that even if multiple calls arrive here concurrently,
      // they will all eventually await the same promise instance created by the first one
      // to complete this assignment.
      this.hasInitialized = this._performInitializationAndStore();
    }

    try {
      // Await the stored promise.
      // If initialization was successful, this resolves.
      // If it failed, this will re-throw the error caught and re-thrown by _performInitializationAndStore.
      await this.hasInitialized;
    } catch (error) {
      // The error has already been handled by _performInitializationAndStore
      // (i.e., this.hasInitialized was reset). Re-throwing here ensures
      // the caller of init() is aware of the failure.
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_INIT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName: this.tableName },
        },
        error,
      );
    }
  }

  /**
   * Performs the actual table validation and stores the promise.
   * Handles resetting the stored promise on failure to allow retries.
   */
  private _performInitializationAndStore(): Promise<boolean> {
    return this.validateTableExists()
      .then(exists => {
        if (!exists) {
          throw new Error(
            `Table ${this.tableName} does not exist or is not accessible. Ensure it's created via CDK/CloudFormation before using this store.`,
          );
        }
        // Successfully initialized
        return true;
      })
      .catch(err => {
        // Initialization failed. Clear the stored promise to allow future calls to init() to retry.
        this.hasInitialized = null;
        // Re-throw the error so it can be caught by the awaiter in init()
        throw err;
      });
  }

  async createTable({ tableName, schema }: { tableName: TABLE_NAMES; schema: Record<string, any> }): Promise<void> {
    return this.stores.operations.createTable({ tableName, schema });
  }

  async alterTable(_args: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    return this.stores.operations.alterTable(_args);
  }

  async clearTable({ tableName }: { tableName: SUPPORTED_TABLE_NAMES }): Promise<void> {
    return this.stores.operations.clearTable({ tableName });
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.dropTable({ tableName });
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    return this.stores.operations.insert({ tableName, record });
  }

  async batchInsert({
    tableName,
    records,
  }: {
    tableName: SUPPORTED_TABLE_NAMES;
    records: Record<string, any>[];
  }): Promise<void> {
    return this.stores.operations.batchInsert({ tableName, records });
  }

  async load<R>({
    tableName,
    keys,
  }: {
    tableName: SUPPORTED_TABLE_NAMES;
    keys: Record<string, string>;
  }): Promise<R | null> {
    return this.stores.operations.load({ tableName, keys });
  }

  // Thread operations
  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    this.logger.debug('Getting thread by ID', { threadId });
    try {
      const result = await this.service.entities.thread.get({ entity: 'thread', id: threadId }).go();

      if (!result.data) {
        return null;
      }

      // ElectroDB handles the transformation with attribute getters
      const data = result.data;
      return {
        ...data,
        // Convert date strings back to Date objects for consistency
        createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
        updatedAt: typeof data.updatedAt === 'string' ? new Date(data.updatedAt) : data.updatedAt,
        // metadata: data.metadata ? JSON.parse(data.metadata) : undefined, // REMOVED by AI
        // metadata is already transformed by the entity's getter
      } as StorageThreadType;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_GET_THREAD_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }

  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    this.logger.debug('Getting threads by resource ID', { resourceId });
    try {
      const result = await this.service.entities.thread.query.byResource({ entity: 'thread', resourceId }).go();

      if (!result.data.length) {
        return [];
      }

      // ElectroDB handles the transformation with attribute getters
      return result.data.map((data: any) => ({
        ...data,
        // Convert date strings back to Date objects for consistency
        createdAt: typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt,
        updatedAt: typeof data.updatedAt === 'string' ? new Date(data.updatedAt) : data.updatedAt,
        // metadata: data.metadata ? JSON.parse(data.metadata) : undefined, // REMOVED by AI
        // metadata is already transformed by the entity's getter
      })) as StorageThreadType[];
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_GET_THREADS_BY_RESOURCE_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId },
        },
        error,
      );
    }
  }

  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    this.logger.debug('Saving thread', { threadId: thread.id });

    const now = new Date();

    const threadData = {
      entity: 'thread',
      id: thread.id,
      resourceId: thread.resourceId,
      title: thread.title || `Thread ${thread.id}`,
      createdAt: thread.createdAt?.toISOString() || now.toISOString(),
      updatedAt: now.toISOString(),
      metadata: thread.metadata ? JSON.stringify(thread.metadata) : undefined,
    };

    try {
      await this.service.entities.thread.upsert(threadData).go();

      return {
        id: thread.id,
        resourceId: thread.resourceId,
        title: threadData.title,
        createdAt: thread.createdAt || now,
        updatedAt: now,
        metadata: thread.metadata,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_SAVE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId: thread.id },
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
    this.logger.debug('Updating thread', { threadId: id });

    try {
      // First, get the existing thread to merge with updates
      const existingThread = await this.getThreadById({ threadId: id });

      if (!existingThread) {
        throw new Error(`Thread not found: ${id}`);
      }

      const now = new Date();

      // Prepare the update
      // Define type for only the fields we are actually updating
      type ThreadUpdatePayload = {
        updatedAt: string; // ISO String for DDB
        title?: string;
        metadata?: string; // Stringified JSON for DDB
      };
      const updateData: ThreadUpdatePayload = {
        updatedAt: now.toISOString(),
      };

      if (title) {
        updateData.title = title;
      }

      if (metadata) {
        updateData.metadata = JSON.stringify(metadata); // Stringify metadata for update
      }

      // Update the thread using the primary key
      await this.service.entities.thread.update({ entity: 'thread', id }).set(updateData).go();

      // Return the potentially updated thread object
      return {
        ...existingThread,
        title: title || existingThread.title,
        metadata: metadata || existingThread.metadata,
        updatedAt: now,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_UPDATE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId: id },
        },
        error,
      );
    }
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    this.logger.debug('Deleting thread', { threadId });

    try {
      // Delete the thread using the primary key
      await this.service.entities.thread.delete({ entity: 'thread', id: threadId }).go();

      // Note: In a production system, you might want to:
      // 1. Delete all messages associated with this thread
      // 2. Delete any vector embeddings related to this thread
      // These would be additional operations
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_DELETE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }

  // Message operations
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages({
    threadId,
    resourceId,
    selectBy,
    format,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    this.logger.debug('Getting messages', { threadId, selectBy });

    try {
      // Query messages by thread ID using the GSI
      // Provide *all* composite key components for the 'byThread' index ('entity', 'threadId')
      const query = this.service.entities.message.query.byThread({ entity: 'message', threadId });

      const limit = this.resolveMessageLimit({ last: selectBy?.last, defaultLimit: Number.MAX_SAFE_INTEGER });
      // Apply the 'last' limit if provided
      if (limit !== Number.MAX_SAFE_INTEGER) {
        // Use ElectroDB's limit parameter
        // DDB GSIs are sorted in ascending order
        // Use ElectroDB's order parameter to sort in descending order to retrieve 'latest' messages
        const results = await query.go({ limit, order: 'desc' });
        // Use arrow function in map to preserve 'this' context for parseMessageData
        const list = new MessageList({ threadId, resourceId }).add(
          results.data.map((data: any) => this.parseMessageData(data)),
          'memory',
        );
        if (format === `v2`) return list.get.all.v2();
        return list.get.all.v1();
      }

      // If no limit specified, get all messages (potentially paginated by ElectroDB)
      // Consider adding default limit or handling pagination if needed
      const results = await query.go();
      const list = new MessageList({ threadId, resourceId }).add(
        results.data.map((data: any) => this.parseMessageData(data)),
        'memory',
      );
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_GET_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
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
    const { messages, format = 'v1' } = args;
    this.logger.debug('Saving messages', { count: messages.length });

    if (!messages.length) {
      return [];
    }

    const threadId = messages[0]?.threadId;
    if (!threadId) {
      throw new Error('Thread ID is required');
    }

    // Ensure 'entity' is added and complex fields are handled
    const messagesToSave = messages.map(msg => {
      const now = new Date().toISOString();
      return {
        entity: 'message', // Add entity type
        id: msg.id,
        threadId: msg.threadId,
        role: msg.role,
        type: msg.type,
        resourceId: msg.resourceId,
        // Ensure complex fields are stringified if not handled by attribute setters
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        toolCallArgs: `toolCallArgs` in msg && msg.toolCallArgs ? JSON.stringify(msg.toolCallArgs) : undefined,
        toolCallIds: `toolCallIds` in msg && msg.toolCallIds ? JSON.stringify(msg.toolCallIds) : undefined,
        toolNames: `toolNames` in msg && msg.toolNames ? JSON.stringify(msg.toolNames) : undefined,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt || now,
        updatedAt: now, // Add updatedAt
      };
    });

    try {
      // Process messages in batch
      const batchSize = 25; // DynamoDB batch limits
      const batches = [];

      for (let i = 0; i < messagesToSave.length; i += batchSize) {
        const batch = messagesToSave.slice(i, i + batchSize);
        batches.push(batch);
      }

      // Process each batch and update thread's updatedAt in parallel for better performance
      await Promise.all([
        // Process message batches
        ...batches.map(async batch => {
          for (const messageData of batch) {
            // Ensure each item has the entity property before sending
            if (!messageData.entity) {
              this.logger.error('Missing entity property in message data for create', { messageData });
              throw new Error('Internal error: Missing entity property during saveMessages');
            }
            await this.service.entities.message.put(messageData).go();
          }
        }),
        // Update thread's updatedAt timestamp
        this.service.entities.thread
          .update({ entity: 'thread', id: threadId })
          .set({
            updatedAt: new Date().toISOString(),
          })
          .go(),
      ]);

      const list = new MessageList().add(messages, 'memory');
      if (format === `v1`) return list.get.all.v1();
      return list.get.all.v2();
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_SAVE_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { count: messages.length },
        },
        error,
      );
    }
  }

  // Helper function to parse message data (handle JSON fields)
  private parseMessageData(data: any): MastraMessageV2 | MastraMessageV1 {
    // Removed try/catch and JSON.parse logic - now handled by entity 'get' attributes
    // This function now primarily ensures correct typing and Date conversion.
    return {
      ...data,
      // Ensure dates are Date objects if needed (ElectroDB might return strings)
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
      // Other fields like content, toolCallArgs etc. are assumed to be correctly
      // transformed by the ElectroDB entity getters.
    };
  }

  // Trace operations
  async getTraces(args: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
    filters?: Record<string, any>;
  }): Promise<any[]> {
    const { name, scope, page, perPage } = args;
    this.logger.debug('Getting traces', { name, scope, page, perPage });

    try {
      let query;

      // Determine which index to use based on the provided filters
      // Provide *all* composite key components for the relevant index
      if (name) {
        query = this.service.entities.trace.query.byName({ entity: 'trace', name });
      } else if (scope) {
        query = this.service.entities.trace.query.byScope({ entity: 'trace', scope });
      } else {
        this.logger.warn('Performing a scan operation on traces - consider using a more specific query');
        query = this.service.entities.trace.scan;
      }

      let items: any[] = [];
      let cursor = null;
      let pagesFetched = 0;
      const startPage = page > 0 ? page : 1;

      do {
        const results: { data: any[]; cursor: string | null } = await query.go({ cursor, limit: perPage });
        pagesFetched++;
        if (pagesFetched === startPage) {
          items = results.data;
          break;
        }
        cursor = results.cursor;
        if (!cursor && results.data.length > 0 && pagesFetched < startPage) {
          break;
        }
      } while (cursor && pagesFetched < startPage);

      return items;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_GET_TRACES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async batchTraceInsert({ records }: { records: Record<string, any>[] }): Promise<void> {
    this.logger.debug('Batch inserting traces', { count: records.length });

    if (!records.length) {
      return;
    }

    try {
      // Add 'entity' type to each record before passing to generic batchInsert
      const recordsToSave = records.map(rec => ({ entity: 'trace', ...rec }));
      await this.batchInsert({
        tableName: TABLE_TRACES,
        records: recordsToSave, // Pass records with 'entity' included
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_BATCH_TRACE_INSERT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { count: records.length },
        },
        error,
      );
    }
  }

  // Workflow operations
  async persistWorkflowSnapshot({
    workflowName,
    runId,
    snapshot,
  }: {
    workflowName: string;
    runId: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    this.logger.debug('Persisting workflow snapshot', { workflowName, runId });

    try {
      const resourceId = 'resourceId' in snapshot ? snapshot.resourceId : undefined;
      const now = new Date().toISOString();
      // Prepare data including the 'entity' type
      const data = {
        entity: 'workflow_snapshot', // Add entity type
        workflow_name: workflowName,
        run_id: runId,
        snapshot: JSON.stringify(snapshot), // Stringify the snapshot object
        createdAt: now,
        updatedAt: now,
        resourceId,
      };
      // Use upsert instead of create to handle both create and update cases
      await this.service.entities.workflow_snapshot.upsert(data).go();
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_PERSIST_WORKFLOW_SNAPSHOT_FAILED',
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
    this.logger.debug('Loading workflow snapshot', { workflowName, runId });

    try {
      // Provide *all* composite key components for the primary index ('entity', 'workflow_name', 'run_id')
      const result = await this.service.entities.workflow_snapshot
        .get({
          entity: 'workflow_snapshot', // Add entity type
          workflow_name: workflowName,
          run_id: runId,
        })
        .go();

      if (!result.data?.snapshot) {
        // Check snapshot exists
        return null;
      }

      // Parse the snapshot string
      return result.data.snapshot as WorkflowRunState;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_LOAD_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }

  async getWorkflowRuns(args?: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
    resourceId?: string;
  }): Promise<WorkflowRuns> {
    this.logger.debug('Getting workflow runs', { args });

    try {
      // Default values
      const limit = args?.limit || 10;
      const offset = args?.offset || 0;

      let query;

      if (args?.workflowName) {
        // Query by workflow name using the primary index
        // Provide *all* composite key components for the PK ('entity', 'workflow_name')
        query = this.service.entities.workflow_snapshot.query.primary({
          entity: 'workflow_snapshot', // Add entity type
          workflow_name: args.workflowName,
        });
      } else {
        // If no workflow name, we need to scan
        // This is not ideal for production with large datasets
        this.logger.warn('Performing a scan operation on workflow snapshots - consider using a more specific query');
        query = this.service.entities.workflow_snapshot.scan; // Scan still uses the service entity
      }

      const allMatchingSnapshots: WorkflowSnapshotDBItem[] = [];
      let cursor: string | null = null;
      const DYNAMODB_PAGE_SIZE = 100; // Sensible page size for fetching

      do {
        const pageResults: { data: WorkflowSnapshotDBItem[]; cursor: string | null } = await query.go({
          limit: DYNAMODB_PAGE_SIZE,
          cursor,
        });

        if (pageResults.data && pageResults.data.length > 0) {
          let pageFilteredData: WorkflowSnapshotDBItem[] = pageResults.data;

          // Apply date filters if specified
          if (args?.fromDate || args?.toDate) {
            pageFilteredData = pageFilteredData.filter((snapshot: WorkflowSnapshotDBItem) => {
              const createdAt = new Date(snapshot.createdAt);
              if (args.fromDate && createdAt < args.fromDate) {
                return false;
              }
              if (args.toDate && createdAt > args.toDate) {
                return false;
              }
              return true;
            });
          }

          // Filter by resourceId if specified
          if (args?.resourceId) {
            pageFilteredData = pageFilteredData.filter((snapshot: WorkflowSnapshotDBItem) => {
              return snapshot.resourceId === args.resourceId;
            });
          }
          allMatchingSnapshots.push(...pageFilteredData);
        }

        cursor = pageResults.cursor;
      } while (cursor);

      if (!allMatchingSnapshots.length) {
        return { runs: [], total: 0 };
      }

      // Apply offset and limit to the accumulated filtered results
      const total = allMatchingSnapshots.length;
      const paginatedData = allMatchingSnapshots.slice(offset, offset + limit);

      // Format and return the results
      const runs = paginatedData.map((snapshot: WorkflowSnapshotDBItem) => this.formatWorkflowRun(snapshot));

      return {
        runs,
        total,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_GET_WORKFLOW_RUNS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName: args?.workflowName || '', resourceId: args?.resourceId || '' },
        },
        error,
      );
    }
  }

  async getWorkflowRunById(args: { runId: string; workflowName?: string }): Promise<WorkflowRun | null> {
    const { runId, workflowName } = args;
    this.logger.debug('Getting workflow run by ID', { runId, workflowName });

    console.log('workflowName', workflowName);
    console.log('runId', runId);

    try {
      // If we have a workflowName, we can do a direct get using the primary key
      if (workflowName) {
        this.logger.debug('WorkflowName provided, using direct GET operation.');
        const result = await this.service.entities.workflow_snapshot
          .get({
            entity: 'workflow_snapshot', // Entity type for PK
            workflow_name: workflowName,
            run_id: runId,
          })
          .go();

        console.log('result', result);

        if (!result.data) {
          return null;
        }

        const snapshot = result.data.snapshot;
        return {
          workflowName: result.data.workflow_name,
          runId: result.data.run_id,
          snapshot,
          createdAt: new Date(result.data.createdAt),
          updatedAt: new Date(result.data.updatedAt),
          resourceId: result.data.resourceId,
        };
      }

      // Otherwise, if workflowName is not provided, use the GSI on runId.
      // This is more efficient than a full table scan.
      this.logger.debug(
        'WorkflowName not provided. Attempting to find workflow run by runId using GSI. Ensure GSI (e.g., "byRunId") is defined on the workflowSnapshot entity with run_id as its key and provisioned in DynamoDB.',
      );

      // IMPORTANT: This assumes a GSI (e.g., named 'byRunId') exists on the workflowSnapshot entity
      // with 'run_id' as its partition key. This GSI must be:
      // 1. Defined in your ElectroDB model (e.g., in stores/dynamodb/src/entities/index.ts).
      // 2. Provisioned in the actual DynamoDB table (e.g., via CDK/CloudFormation).
      // The query key object includes 'entity' as it's good practice with ElectroDB and single-table design,
      // aligning with how other GSIs are queried in this file.
      const result = await this.service.entities.workflow_snapshot.query
        .gsi2({ entity: 'workflow_snapshot', run_id: runId }) // Replace 'byRunId' with your actual GSI name
        .go();

      // If the GSI query returns multiple items (e.g., if run_id is not globally unique across all snapshots),
      // this will take the first one. The original scan logic also effectively took the first match found.
      // If run_id is guaranteed unique, result.data should contain at most one item.
      const matchingRunDbItem: WorkflowSnapshotDBItem | null =
        result.data && result.data.length > 0 ? result.data[0] : null;

      if (!matchingRunDbItem) {
        return null;
      }

      const snapshot = matchingRunDbItem.snapshot;
      return {
        workflowName: matchingRunDbItem.workflow_name,
        runId: matchingRunDbItem.run_id,
        snapshot,
        createdAt: new Date(matchingRunDbItem.createdAt),
        updatedAt: new Date(matchingRunDbItem.updatedAt),
        resourceId: matchingRunDbItem.resourceId,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_GET_WORKFLOW_RUN_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { runId, workflowName: args?.workflowName || '' },
        },
        error,
      );
    }
  }

  // Helper function to format workflow run
  private formatWorkflowRun(snapshotData: WorkflowSnapshotDBItem): WorkflowRun {
    return {
      workflowName: snapshotData.workflow_name,
      runId: snapshotData.run_id,
      snapshot: snapshotData.snapshot as WorkflowRunState,
      createdAt: new Date(snapshotData.createdAt),
      updatedAt: new Date(snapshotData.updatedAt),
      resourceId: snapshotData.resourceId,
    };
  }

  // Eval operations
  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    return this.stores.legacyEvals.getEvalsByAgentName(agentName, type);
  }

  async getEvals(
    options: {
      agentName?: string;
      type?: 'test' | 'live';
    } & PaginationArgs,
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    return this.stores.legacyEvals.getEvals(options);
  }

  async getTracesPaginated(_args: StorageGetTracesArg): Promise<PaginationInfo & { traces: Trace[] }> {
    throw new MastraError(
      {
        id: 'STORAGE_DYNAMODB_STORE_GET_TRACES_PAGINATED_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      new Error('Method not implemented.'),
    );
  }

  async getThreadsByResourceIdPaginated(_args: {
    resourceId: string;
    page?: number;
    perPage?: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    throw new MastraError(
      {
        id: 'STORAGE_DYNAMODB_STORE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      new Error('Method not implemented.'),
    );
  }

  async getMessagesPaginated(
    _args: StorageGetMessagesArg,
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    throw new MastraError(
      {
        id: 'STORAGE_DYNAMODB_STORE_GET_MESSAGES_PAGINATED_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.THIRD_PARTY,
      },
      new Error('Method not implemented.'),
    );
  }

  /**
   * Closes the DynamoDB client connection and cleans up resources.
   * Should be called when the store is no longer needed, e.g., at the end of tests or application shutdown.
   */
  public async close(): Promise<void> {
    this.logger.debug('Closing DynamoDB client for store:', { name: this.name });
    try {
      this.client.destroy();
      this.logger.debug('DynamoDB client closed successfully for store:', { name: this.name });
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_DYNAMODB_STORE_CLOSE_FAILED',
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
    this.logger.error('updateMessages is not yet implemented in DynamoDBStore');
    throw new Error('Method not implemented');
  }

  /**
   * SCORERS - Not implemented
   */
  async getScoreById({ id: _id }: { id: string }): Promise<ScoreRowData | null> {
    throw new Error(
      `Scores functionality is not implemented in this storage adapter (${this.constructor.name}). ` +
        `To use scores functionality, implement the required methods in this storage adapter.`,
    );
  }

  async saveScore(_score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    throw new Error(
      `Scores functionality is not implemented in this storage adapter (${this.constructor.name}). ` +
        `To use scores functionality, implement the required methods in this storage adapter.`,
    );
  }

  async getScoresByRunId({
    runId: _runId,
    pagination: _pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    throw new Error(
      `Scores functionality is not implemented in this storage adapter (${this.constructor.name}). ` +
        `To use scores functionality, implement the required methods in this storage adapter.`,
    );
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
    throw new Error(
      `Scores functionality is not implemented in this storage adapter (${this.constructor.name}). ` +
        `To use scores functionality, implement the required methods in this storage adapter.`,
    );
  }

  async getScoresByScorerId({
    scorerId: _scorerId,
    pagination: _pagination,
  }: {
    scorerId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    throw new Error(
      `Scores functionality is not implemented in this storage adapter (${this.constructor.name}). ` +
        `To use scores functionality, implement the required methods in this storage adapter.`,
    );
  }
}
