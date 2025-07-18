import { MessageList } from '@mastra/core/agent';
import type { MastraMessageContentV2 } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { MastraMessageV1, MastraMessageV2, StorageThreadType } from '@mastra/core/memory';
import {
  MemoryStorage,
  resolveMessageLimit,
  TABLE_MESSAGES,
  TABLE_RESOURCES,
  TABLE_THREADS,
} from '@mastra/core/storage';
import type { PaginationArgs, PaginationInfo, StorageGetMessagesArg, StorageResourceType } from '@mastra/core/storage';
import type { Db, MongoClientOptions } from 'mongodb';
import { MongoClient } from 'mongodb';
import type { StoreOperationsMongoDB } from '../operations';
import { safelyParseJSON, formatDateForMongoDB } from '../utils';

export interface MongoDBMemoryConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class MemoryMongoDB extends MemoryStorage {
  #isConnected = false;
  #client: MongoClient;
  #db: Db | undefined;
  readonly #dbName: string;
  private operations: StoreOperationsMongoDB;

  constructor({ url, dbName, options, operations }: MongoDBMemoryConfig & { operations: StoreOperationsMongoDB }) {
    super();
    this.#isConnected = false;
    this.#dbName = dbName;
    this.#client = new MongoClient(url, options);
    this.operations = operations;
  }

  private async getConnection(): Promise<Db> {
    if (this.#isConnected) {
      return this.#db!;
    }

    await this.#client.connect();
    this.#db = this.#client.db(this.#dbName);
    this.#isConnected = true;
    return this.#db;
  }

  private async getCollection(collectionName: string) {
    const db = await this.getConnection();
    return db.collection(collectionName);
  }

  private parseRow(row: any): MastraMessageV2 {
    let content = row.content;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        // use content as is if it's not JSON
      }
    }
    
    const result = {
      id: row.id,
      content,
      role: row.role,
      createdAt: formatDateForMongoDB(row.createdAt),
      threadId: row.thread_id,
      resourceId: row.resourceId,
    } as MastraMessageV2;
    
    if (row.type && row.type !== 'v2') result.type = row.type;
    return result;
  }

  private async _getIncludedMessages({
    threadId,
    selectBy,
  }: {
    threadId: string;
    selectBy: StorageGetMessagesArg['selectBy'];
  }) {
    const include = selectBy?.include;
    if (!include) return null;

    const collection = await this.getCollection(TABLE_MESSAGES);
    
    // Get all messages for the thread ordered by creation date
    const allMessages = await collection
      .find({ thread_id: threadId })
      .sort({ createdAt: 1 })
      .toArray();

    const includedMessages: any[] = [];
    
    for (const inc of include) {
      const { id, withPreviousMessages = 0, withNextMessages = 0 } = inc;
      const searchThreadId = inc.threadId || threadId;
      
      // Find the target message
      const targetIndex = allMessages.findIndex(msg => msg.id === id && msg.thread_id === searchThreadId);
      
      if (targetIndex === -1) continue;
      
      // Get previous messages
      const startIndex = Math.max(0, targetIndex - withPreviousMessages);
      // Get next messages
      const endIndex = Math.min(allMessages.length - 1, targetIndex + withNextMessages);
      
      // Add messages in range
      for (let i = startIndex; i <= endIndex; i++) {
        includedMessages.push(allMessages[i]);
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    const dedupedMessages = includedMessages.filter(msg => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });

    return dedupedMessages.map(row => this.parseRow(row));
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
    try {
      const messages: MastraMessageV2[] = [];
      const limit = resolveMessageLimit({ last: selectBy?.last, defaultLimit: 40 });
      
      if (selectBy?.include?.length) {
        const includeMessages = await this._getIncludedMessages({ threadId, selectBy });
        if (includeMessages) {
          messages.push(...includeMessages);
        }
      }

      const excludeIds = messages.map(m => m.id);
      const collection = await this.getCollection(TABLE_MESSAGES);
      
      const query: any = { thread_id: threadId };
      if (excludeIds.length > 0) {
        query.id = { $nin: excludeIds };
      }

      const remainingMessages = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      messages.push(...remainingMessages.map(row => this.parseRow(row)));
      
      // Sort all messages by creation date ascending
      messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      const list = new MessageList().add(messages, 'memory');
      if (format === 'v2') return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }

  public async getMessagesPaginated(
    args: StorageGetMessagesArg & {
      format?: 'v1' | 'v2';
    },
  ): Promise<PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }> {
    const { threadId, format, selectBy } = args;
    const { page = 0, perPage: perPageInput, dateRange } = selectBy?.pagination || {};
    const perPage =
      perPageInput !== undefined ? perPageInput : resolveMessageLimit({ last: selectBy?.last, defaultLimit: 40 });
    const fromDate = dateRange?.start;
    const toDate = dateRange?.end;

    const messages: MastraMessageV2[] = [];

    if (selectBy?.include?.length) {
      try {
        const includeMessages = await this._getIncludedMessages({ threadId, selectBy });
        if (includeMessages) {
          messages.push(...includeMessages);
        }
      } catch (error) {
        throw new MastraError(
          {
            id: 'MONGODB_STORE_GET_MESSAGES_PAGINATED_GET_INCLUDE_MESSAGES_FAILED',
            domain: ErrorDomain.STORAGE,
            category: ErrorCategory.THIRD_PARTY,
            details: { threadId },
          },
          error,
        );
      }
    }

    try {
      const currentOffset = page * perPage;
      const collection = await this.getCollection(TABLE_MESSAGES);

      const query: any = { thread_id: threadId };
      
      if (fromDate) {
        query.createdAt = { ...query.createdAt, $gte: fromDate };
      }
      if (toDate) {
        query.createdAt = { ...query.createdAt, $lte: toDate };
      }

      const total = await collection.countDocuments(query);

      if (total === 0 && messages.length === 0) {
        return {
          messages: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      const excludeIds = messages.map(m => m.id);
      if (excludeIds.length > 0) {
        query.id = { $nin: excludeIds };
      }

      const dataResult = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      messages.push(...dataResult.map(row => this.parseRow(row)));

      const messagesToReturn =
        format === 'v1'
          ? new MessageList().add(messages, 'memory').get.all.v1()
          : new MessageList().add(messages, 'memory').get.all.v2();

      return {
        messages: messagesToReturn,
        total,
        page,
        perPage,
        hasMore: currentOffset + messages.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'MONGODB_STORE_GET_MESSAGES_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
      this.logger?.trackException?.(mastraError);
      this.logger?.error?.(mastraError.toString());
      return { messages: [], total: 0, page, perPage, hasMore: false };
    }
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages({
    messages,
    format,
  }:
    | { messages: MastraMessageV1[]; format?: undefined | 'v1' }
    | { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    if (messages.length === 0) return messages;

    try {
      const threadId = messages[0]?.threadId;
      if (!threadId) {
        throw new Error('Thread ID is required');
      }

      const collection = await this.getCollection(TABLE_MESSAGES);
      const threadsCollection = await this.getCollection(TABLE_THREADS);

      // Prepare messages for insertion
      const messagesToInsert = messages.map(message => {
        const time = message.createdAt || new Date();
        if (!message.threadId) {
          throw new Error(
            'Expected to find a threadId for message, but couldn\'t find one. An unexpected error has occurred.',
          );
        }
        if (!message.resourceId) {
          throw new Error(
            'Expected to find a resourceId for message, but couldn\'t find one. An unexpected error has occurred.',
          );
        }
        
        return {
          updateOne: {
            filter: { id: message.id },
            update: {
              $set: {
                id: message.id,
                thread_id: message.threadId!,
                content: typeof message.content === 'object' ? JSON.stringify(message.content) : message.content,
                role: message.role,
                type: message.type || 'v2',
                createdAt: formatDateForMongoDB(time),
                resourceId: message.resourceId,
              },
            },
            upsert: true,
          },
        };
      });

      // Execute message inserts and thread update in parallel
      await Promise.all([
        collection.bulkWrite(messagesToInsert),
        threadsCollection.updateOne(
          { id: threadId },
          { $set: { updatedAt: new Date() } }
        ),
      ]);

      const list = new MessageList().add(messages, 'memory');
      if (format === 'v2') return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_SAVE_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async updateMessages({
    messages,
  }: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraMessageV2[]> {
    if (messages.length === 0) {
      return [];
    }

    const messageIds = messages.map(m => m.id);
    const collection = await this.getCollection(TABLE_MESSAGES);
    
    const existingMessages = await collection
      .find({ id: { $in: messageIds } })
      .toArray();

    const existingMessagesParsed: MastraMessageV2[] = existingMessages.map(msg => this.parseRow(msg));

    if (existingMessagesParsed.length === 0) {
      return [];
    }

    const threadIdsToUpdate = new Set<string>();
    const bulkOps = [];

    for (const existingMessage of existingMessagesParsed) {
      const updatePayload = messages.find(m => m.id === existingMessage.id);
      if (!updatePayload) continue;

      const { id, ...fieldsToUpdate } = updatePayload;
      if (Object.keys(fieldsToUpdate).length === 0) continue;

      threadIdsToUpdate.add(existingMessage.threadId!);
      if (updatePayload.threadId && updatePayload.threadId !== existingMessage.threadId) {
        threadIdsToUpdate.add(updatePayload.threadId);
      }

      const updateDoc: any = {};
      const updatableFields = { ...fieldsToUpdate };

      // Special handling for content field to merge instead of overwrite
      if (updatableFields.content) {
        const newContent = {
          ...existingMessage.content,
          ...updatableFields.content,
          // Deep merge metadata if it exists on both
          ...(existingMessage.content?.metadata && updatableFields.content.metadata
            ? {
                metadata: {
                  ...existingMessage.content.metadata,
                  ...updatableFields.content.metadata,
                },
              }
            : {}),
        };
        updateDoc.content = JSON.stringify(newContent);
        delete updatableFields.content;
      }

      // Handle other fields
      for (const key in updatableFields) {
        if (Object.prototype.hasOwnProperty.call(updatableFields, key)) {
          const dbKey = key === 'threadId' ? 'thread_id' : key;
          let value = updatableFields[key as keyof typeof updatableFields];

          if (typeof value === 'object' && value !== null) {
            value = JSON.stringify(value);
          }
          updateDoc[dbKey] = value;
        }
      }

      if (Object.keys(updateDoc).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: { id },
            update: { $set: updateDoc },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await collection.bulkWrite(bulkOps);
    }

    // Update thread timestamps
    if (threadIdsToUpdate.size > 0) {
      const threadsCollection = await this.getCollection(TABLE_THREADS);
      await threadsCollection.updateMany(
        { id: { $in: Array.from(threadIdsToUpdate) } },
        { $set: { updatedAt: new Date() } }
      );
    }

    // Re-fetch updated messages
    const updatedMessages = await collection
      .find({ id: { $in: messageIds } })
      .toArray();

    return updatedMessages.map(row => this.parseRow(row));
  }

  async getResourceById({ resourceId }: { resourceId: string }): Promise<StorageResourceType | null> {
    const result = await this.operations.load<StorageResourceType>({
      tableName: TABLE_RESOURCES,
      keys: { id: resourceId },
    });

    if (!result) {
      return null;
    }

    return {
      ...result,
      // Ensure workingMemory is always returned as a string, even if auto-parsed as JSON
      workingMemory:
        result.workingMemory && typeof result.workingMemory === 'object'
          ? JSON.stringify(result.workingMemory)
          : result.workingMemory,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata,
      createdAt: formatDateForMongoDB(result.createdAt),
      updatedAt: formatDateForMongoDB(result.updatedAt),
    };
  }

  async saveResource({ resource }: { resource: StorageResourceType }): Promise<StorageResourceType> {
    await this.operations.insert({
      tableName: TABLE_RESOURCES,
      record: {
        ...resource,
        metadata: JSON.stringify(resource.metadata),
      },
    });

    return resource;
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
    const existingResource = await this.getResourceById({ resourceId });

    if (!existingResource) {
      // Create new resource if it doesn't exist
      const newResource: StorageResourceType = {
        id: resourceId,
        workingMemory,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return this.saveResource({ resource: newResource });
    }

    const updatedResource = {
      ...existingResource,
      workingMemory: workingMemory !== undefined ? workingMemory : existingResource.workingMemory,
      metadata: {
        ...existingResource.metadata,
        ...metadata,
      },
      updatedAt: new Date(),
    };

    const collection = await this.getCollection(TABLE_RESOURCES);
    const updateDoc: any = { updatedAt: updatedResource.updatedAt };

    if (workingMemory !== undefined) {
      updateDoc.workingMemory = workingMemory;
    }

    if (metadata) {
      updateDoc.metadata = JSON.stringify(updatedResource.metadata);
    }

    await collection.updateOne(
      { id: resourceId },
      { $set: updateDoc }
    );

    return updatedResource;
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    try {
      const result = await this.operations.load<
        Omit<StorageThreadType, 'createdAt' | 'updatedAt'> & { createdAt: string | Date; updatedAt: string | Date }
      >({
        tableName: TABLE_THREADS,
        keys: { id: threadId },
      });

      if (!result) {
        return null;
      }

      return {
        ...result,
        metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata,
        createdAt: formatDateForMongoDB(result.createdAt),
        updatedAt: formatDateForMongoDB(result.updatedAt),
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_THREAD_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }

  /**
   * @deprecated use getThreadsByResourceIdPaginated instead for paginated results.
   */
  public async getThreadsByResourceId(args: { resourceId: string }): Promise<StorageThreadType[]> {
    const { resourceId } = args;

    try {
      const collection = await this.getCollection(TABLE_THREADS);
      const results = await collection
        .find({ resourceId })
        .sort({ createdAt: -1 })
        .toArray();

      return results.map(thread => ({
        id: thread.id as string,
        resourceId: thread.resourceId as string,
        title: thread.title as string,
        createdAt: formatDateForMongoDB(thread.createdAt),
        updatedAt: formatDateForMongoDB(thread.updatedAt),
        metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
      }));
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'MONGODB_STORE_GET_THREADS_BY_RESOURCE_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId },
        },
        error,
      );
      this.logger?.trackException?.(mastraError);
      this.logger?.error?.(mastraError.toString());
      return [];
    }
  }

  public async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page: number;
    perPage: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    const { resourceId, page = 0, perPage = 100 } = args;

    try {
      const collection = await this.getCollection(TABLE_THREADS);
      const currentOffset = page * perPage;

      const total = await collection.countDocuments({ resourceId });

      if (total === 0) {
        return {
          threads: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      const results = await collection
        .find({ resourceId })
        .sort({ createdAt: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      const threads = results.map(thread => ({
        id: thread.id as string,
        resourceId: thread.resourceId as string,
        title: thread.title as string,
        createdAt: formatDateForMongoDB(thread.createdAt),
        updatedAt: formatDateForMongoDB(thread.updatedAt),
        metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
      }));

      return {
        threads,
        total,
        page,
        perPage,
        hasMore: currentOffset + threads.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'MONGODB_STORE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId },
        },
        error,
      );
      this.logger?.trackException?.(mastraError);
      this.logger?.error?.(mastraError.toString());
      return { threads: [], total: 0, page, perPage, hasMore: false };
    }
  }

  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    try {
      await this.operations.insert({
        tableName: TABLE_THREADS,
        record: {
          ...thread,
          metadata: JSON.stringify(thread.metadata),
        },
      });

      return thread;
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'MONGODB_STORE_SAVE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId: thread.id },
        },
        error,
      );
      this.logger?.trackException?.(mastraError);
      this.logger?.error?.(mastraError.toString());
      throw mastraError;
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
    const thread = await this.getThreadById({ threadId: id });
    if (!thread) {
      throw new MastraError({
        id: 'MONGODB_STORE_UPDATE_THREAD_FAILED_THREAD_NOT_FOUND',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
        text: `Thread ${id} not found`,
        details: {
          status: 404,
          threadId: id,
        },
      });
    }

    const updatedThread = {
      ...thread,
      title,
      metadata: {
        ...thread.metadata,
        ...metadata,
      },
    };

    try {
      const collection = await this.getCollection(TABLE_THREADS);
      await collection.updateOne(
        { id },
        {
          $set: {
            title,
            metadata: JSON.stringify(updatedThread.metadata),
          },
        }
      );

      return updatedThread;
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_UPDATE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to update thread ${id}`,
          details: { threadId: id },
        },
        error,
      );
    }
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    try {
      const messagesCollection = await this.getCollection(TABLE_MESSAGES);
      const threadsCollection = await this.getCollection(TABLE_THREADS);
      
      // Delete messages for this thread and the thread itself
      await Promise.all([
        messagesCollection.deleteMany({ thread_id: threadId }),
        threadsCollection.deleteOne({ id: threadId }),
      ]);
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_DELETE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }
}