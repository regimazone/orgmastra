import { MessageList } from '@mastra/core/agent';
import type { MastraMessageContentV2, MastraMessageV2 } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { MetricResult, TestInfo, ScoreRowData } from '@mastra/core/eval';
import type { StorageThreadType, MastraMessageV1 } from '@mastra/core/memory';
import {
  MastraStorage,
  TABLE_MESSAGES,
  TABLE_THREADS,
  TABLE_RESOURCES,
  TABLE_WORKFLOW_SNAPSHOT,
  TABLE_EVALS,
  serializeDate,
} from '@mastra/core/storage';
import type {
  TABLE_NAMES,
  StorageColumn,
  StorageGetMessagesArg,
  StorageResourceType,
  EvalRow,
  WorkflowRuns,
  WorkflowRun,
  PaginationInfo,
  PaginationArgs,
  StorageGetTracesArg,
  StoragePagination,
  StorageDomains,
} from '@mastra/core/storage';

import type { WorkflowRunState } from '@mastra/core/workflows';
import { Redis } from '@upstash/redis';
import { StoreOperationsUpstash } from './domains/operations';
import { ScoresUpstash } from './domains/scores';
import { TracesUpstash } from './domains/traces';
import { processRecord } from './domains/utils';

export interface UpstashConfig {
  url: string;
  token: string;
}

export class UpstashStore extends MastraStorage {
  private redis: Redis;
  stores: StorageDomains;

  constructor(config: UpstashConfig) {
    super({ name: 'Upstash' });
    this.redis = new Redis({
      url: config.url,
      token: config.token,
    });

    const operations = new StoreOperationsUpstash({ redis: this.redis });
    const traces = new TracesUpstash({ redis: this.redis, operations });
    const scores = new ScoresUpstash({ redis: this.redis, operations });

    this.stores = {
      operations,
      traces,
      scores,
    } as unknown as StorageDomains;
  }

  public get supports(): {
    selectByIncludeResourceScope: boolean;
    resourceWorkingMemory: boolean;
    hasColumn: boolean;
  } {
    return {
      selectByIncludeResourceScope: true,
      resourceWorkingMemory: true,
      hasColumn: false,
    };
  }

  private transformEvalRecord(record: Record<string, any>): EvalRow {
    // Parse JSON strings if needed
    let result = record.result;
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result);
      } catch {
        console.warn('Failed to parse result JSON:');
      }
    }

    let testInfo = record.test_info;
    if (typeof testInfo === 'string') {
      try {
        testInfo = JSON.parse(testInfo);
      } catch {
        console.warn('Failed to parse test_info JSON:');
      }
    }

    return {
      agentName: record.agent_name,
      input: record.input,
      output: record.output,
      result: result as MetricResult,
      metricName: record.metric_name,
      instructions: record.instructions,
      testInfo: testInfo as TestInfo | undefined,
      globalRunId: record.global_run_id,
      runId: record.run_id,
      createdAt:
        typeof record.created_at === 'string'
          ? record.created_at
          : record.created_at instanceof Date
            ? record.created_at.toISOString()
            : new Date().toISOString(),
    };
  }

  private getKey(tableName: TABLE_NAMES, keys: Record<string, any>): string {
    const keyParts = Object.entries(keys)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}:${value}`);
    return `${tableName}:${keyParts.join(':')}`;
  }

  /**
   * Scans for keys matching the given pattern using SCAN and returns them as an array.
   * @param pattern Redis key pattern, e.g. "table:*"
   * @param batchSize Number of keys to scan per batch (default: 10000)
   */
  private async scanKeys(pattern: string, batchSize = 10000): Promise<string[]> {
    let cursor = '0';
    let keys: string[] = [];
    do {
      // Upstash: scan(cursor, { match, count })
      const [nextCursor, batch] = await this.redis.scan(cursor, {
        match: pattern,
        count: batchSize,
      });
      keys.push(...batch);
      cursor = nextCursor;
    } while (cursor !== '0');
    return keys;
  }

  /**
   * Deletes all keys matching the given pattern using SCAN and DEL in batches.
   * @param pattern Redis key pattern, e.g. "table:*"
   * @param batchSize Number of keys to delete per batch (default: 10000)
   */
  private async scanAndDelete(pattern: string, batchSize = 10000): Promise<number> {
    let cursor = '0';
    let totalDeleted = 0;
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, {
        match: pattern,
        count: batchSize,
      });
      if (keys.length > 0) {
        await this.redis.del(...keys);
        totalDeleted += keys.length;
      }
      cursor = nextCursor;
    } while (cursor !== '0');
    return totalDeleted;
  }

  private getMessageKey(threadId: string, messageId: string): string {
    const key = this.getKey(TABLE_MESSAGES, { threadId, id: messageId });
    return key;
  }

  private getThreadMessagesKey(threadId: string): string {
    return `thread:${threadId}:messages`;
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

  private processRecord(tableName: TABLE_NAMES, record: Record<string, any>) {
    let key: string;

    if (tableName === TABLE_MESSAGES) {
      // For messages, use threadId as the primary key component
      key = this.getKey(tableName, { threadId: record.threadId, id: record.id });
    } else if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
      key = this.getKey(tableName, {
        namespace: record.namespace || 'workflows',
        workflow_name: record.workflow_name,
        run_id: record.run_id,
        ...(record.resourceId ? { resourceId: record.resourceId } : {}),
      });
    } else if (tableName === TABLE_EVALS) {
      key = this.getKey(tableName, { id: record.run_id });
    } else {
      key = this.getKey(tableName, { id: record.id });
    }

    // Convert dates to ISO strings before storing
    const processedRecord = {
      ...record,
      createdAt: serializeDate(record.createdAt),
      updatedAt: serializeDate(record.updatedAt),
    };

    return { key, processedRecord };
  }

  /**
   * @deprecated Use getEvals instead
   */
  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    try {
      const pattern = `${TABLE_EVALS}:*`;
      const keys = await this.scanKeys(pattern);

      // Check if we have any keys before using pipeline
      if (keys.length === 0) {
        return [];
      }

      // Use pipeline for batch fetching to improve performance
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      // Filter by agent name and remove nulls
      const nonNullRecords = results.filter(
        (record): record is Record<string, any> =>
          record !== null && typeof record === 'object' && 'agent_name' in record && record.agent_name === agentName,
      );

      let filteredEvals = nonNullRecords;

      if (type === 'test') {
        filteredEvals = filteredEvals.filter(record => {
          if (!record.test_info) return false;

          // Handle test_info as a JSON string
          try {
            if (typeof record.test_info === 'string') {
              const parsedTestInfo = JSON.parse(record.test_info);
              return parsedTestInfo && typeof parsedTestInfo === 'object' && 'testPath' in parsedTestInfo;
            }

            // Handle test_info as an object
            return typeof record.test_info === 'object' && 'testPath' in record.test_info;
          } catch {
            return false;
          }
        });
      } else if (type === 'live') {
        filteredEvals = filteredEvals.filter(record => {
          if (!record.test_info) return true;

          // Handle test_info as a JSON string
          try {
            if (typeof record.test_info === 'string') {
              const parsedTestInfo = JSON.parse(record.test_info);
              return !(parsedTestInfo && typeof parsedTestInfo === 'object' && 'testPath' in parsedTestInfo);
            }

            // Handle test_info as an object
            return !(typeof record.test_info === 'object' && 'testPath' in record.test_info);
          } catch {
            return true;
          }
        });
      }

      // Transform to EvalRow format
      return filteredEvals.map(record => this.transformEvalRecord(record));
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_EVALS_BY_AGENT_NAME_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName },
        },
        error,
      );
      this.logger?.trackException(mastraError);
      this.logger.error(mastraError.toString());
      return [];
    }
  }

  /**
   * @deprecated use getTracesPaginated instead
   */
  public async getTraces(args: StorageGetTracesArg): Promise<any[]> {
    return this.stores.traces.getTraces(args);
  }

  public async getTracesPaginated(
    args: {
      name?: string;
      scope?: string;
      attributes?: Record<string, string>;
      filters?: Record<string, any>;
    } & PaginationArgs,
  ): Promise<PaginationInfo & { traces: any[] }> {
    return this.stores.traces.getTracesPaginated(args);
  }

  async batchTraceInsert(args: { records: Record<string, any>[] }): Promise<void> {
    return this.stores.traces.batchTraceInsert(args);
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

  /**
   * No-op: This backend is schemaless and does not require schema changes.
   * @param tableName Name of the table
   * @param schema Schema of the table
   * @param ifNotExists Array of column names to add if they don't exist
   */
  async alterTable(args: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    return this.stores.operations.alterTable(args);
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.clearTable({ tableName });
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    return this.stores.operations.dropTable({ tableName });
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    return this.stores.operations.insert({ tableName, record });
  }

  async batchInsert(input: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    return this.stores.operations.batchInsert(input);
  }

  async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null> {
    return this.stores.operations.load<R>({ tableName, keys });
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    try {
      const thread = await this.load<StorageThreadType>({
        tableName: TABLE_THREADS,
        keys: { id: threadId },
      });

      if (!thread) return null;

      return {
        ...thread,
        createdAt: this.ensureDate(thread.createdAt)!,
        updatedAt: this.ensureDate(thread.updatedAt)!,
        metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_THREAD_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId,
          },
        },
        error,
      );
    }
  }

  /**
   * @deprecated use getThreadsByResourceIdPaginated instead
   */
  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    try {
      const pattern = `${TABLE_THREADS}:*`;
      const keys = await this.scanKeys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const allThreads: StorageThreadType[] = [];
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      for (let i = 0; i < results.length; i++) {
        const thread = results[i] as StorageThreadType | null;
        if (thread && thread.resourceId === resourceId) {
          allThreads.push({
            ...thread,
            createdAt: this.ensureDate(thread.createdAt)!,
            updatedAt: this.ensureDate(thread.updatedAt)!,
            metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
          });
        }
      }

      allThreads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return allThreads;
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_THREADS_BY_RESOURCE_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            resourceId,
          },
        },
        error,
      );
      this.logger?.trackException(mastraError);
      this.logger.error(mastraError.toString());
      return [];
    }
  }

  public async getThreadsByResourceIdPaginated(
    args: {
      resourceId: string;
    } & PaginationArgs,
  ): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    const { resourceId, page = 0, perPage = 100 } = args;

    try {
      const allThreads = await this.getThreadsByResourceId({ resourceId });

      const total = allThreads.length;
      const start = page * perPage;
      const end = start + perPage;
      const paginatedThreads = allThreads.slice(start, end);
      const hasMore = end < total;

      return {
        threads: paginatedThreads,
        total,
        page,
        perPage,
        hasMore,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            resourceId,
            page,
            perPage,
          },
        },
        error,
      );
      this.logger?.trackException(mastraError);
      this.logger.error(mastraError.toString());
      return {
        threads: [],
        total: 0,
        page,
        perPage,
        hasMore: false,
      };
    }
  }

  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    try {
      await this.insert({
        tableName: TABLE_THREADS,
        record: thread,
      });
      return thread;
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_SAVE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId: thread.id,
          },
        },
        error,
      );
      this.logger?.trackException(mastraError);
      this.logger.error(mastraError.toString());
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
        id: 'STORAGE_UPSTASH_STORAGE_UPDATE_THREAD_FAILED',
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
        text: `Thread ${id} not found`,
        details: {
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
      await this.saveThread({ thread: updatedThread });
      return updatedThread;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_UPDATE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId: id,
          },
        },
        error,
      );
    }
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    // Delete thread metadata and sorted set
    const threadKey = this.getKey(TABLE_THREADS, { id: threadId });
    const threadMessagesKey = this.getThreadMessagesKey(threadId);
    try {
      const messageIds: string[] = await this.redis.zrange(threadMessagesKey, 0, -1);

      const pipeline = this.redis.pipeline();
      pipeline.del(threadKey);
      pipeline.del(threadMessagesKey);

      for (let i = 0; i < messageIds.length; i++) {
        const messageId = messageIds[i];
        const messageKey = this.getMessageKey(threadId, messageId as string);
        pipeline.del(messageKey);
      }

      await pipeline.exec();

      // Bulk delete all message keys for this thread if any remain
      await this.scanAndDelete(this.getMessageKey(threadId, '*'));
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_DELETE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId,
          },
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
    if (messages.length === 0) return [];

    const threadId = messages[0]?.threadId;
    try {
      if (!threadId) {
        throw new Error('Thread ID is required');
      }

      // Check if thread exists
      const thread = await this.getThreadById({ threadId });
      if (!thread) {
        throw new Error(`Thread ${threadId} not found`);
      }
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_SAVE_MESSAGES_INVALID_ARGS',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
        },
        error,
      );
    }

    // Add an index to each message to maintain order
    const messagesWithIndex = messages.map((message, index) => {
      if (!message.threadId) {
        throw new Error(
          `Expected to find a threadId for message, but couldn't find one. An unexpected error has occurred.`,
        );
      }
      if (!message.resourceId) {
        throw new Error(
          `Expected to find a resourceId for message, but couldn't find one. An unexpected error has occurred.`,
        );
      }
      return {
        ...message,
        _index: index,
      };
    });

    // Get current thread data once (all messages belong to same thread)
    const threadKey = this.getKey(TABLE_THREADS, { id: threadId });
    const existingThread = await this.redis.get<StorageThreadType>(threadKey);

    try {
      const batchSize = 1000;
      for (let i = 0; i < messagesWithIndex.length; i += batchSize) {
        const batch = messagesWithIndex.slice(i, i + batchSize);
        const pipeline = this.redis.pipeline();

        for (const message of batch) {
          const key = this.getMessageKey(message.threadId!, message.id);
          const createdAtScore = new Date(message.createdAt).getTime();
          const score = message._index !== undefined ? message._index : createdAtScore;

          // Check if this message id exists in another thread
          const existingKeyPattern = this.getMessageKey('*', message.id);
          const keys = await this.scanKeys(existingKeyPattern);

          if (keys.length > 0) {
            const pipeline2 = this.redis.pipeline();
            keys.forEach(key => pipeline2.get(key));
            const results = await pipeline2.exec();
            const existingMessages = results.filter(
              (msg): msg is MastraMessageV2 | MastraMessageV1 => msg !== null,
            ) as (MastraMessageV2 | MastraMessageV1)[];
            for (const existingMessage of existingMessages) {
              const existingMessageKey = this.getMessageKey(existingMessage.threadId!, existingMessage.id);
              if (existingMessage && existingMessage.threadId !== message.threadId) {
                pipeline.del(existingMessageKey);
                // Remove from old thread's sorted set
                pipeline.zrem(this.getThreadMessagesKey(existingMessage.threadId!), existingMessage.id);
              }
            }
          }

          // Store the message data
          pipeline.set(key, message);

          // Add to sorted set for this thread
          pipeline.zadd(this.getThreadMessagesKey(message.threadId!), {
            score,
            member: message.id,
          });
        }

        // Update the thread's updatedAt field (only in the first batch)
        if (i === 0 && existingThread) {
          const updatedThread = {
            ...existingThread,
            updatedAt: new Date(),
          };
          pipeline.set(threadKey, processRecord(TABLE_THREADS, updatedThread).processedRecord);
        }

        await pipeline.exec();
      }

      const list = new MessageList().add(messages, 'memory');
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_SAVE_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId,
          },
        },
        error,
      );
    }
  }

  private async _getIncludedMessages(
    threadId: string,
    selectBy: StorageGetMessagesArg['selectBy'],
  ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    const messageIds = new Set<string>();
    const messageIdToThreadIds: Record<string, string> = {};

    // First, get specifically included messages and their context
    if (selectBy?.include?.length) {
      for (const item of selectBy.include) {
        messageIds.add(item.id);

        // Use per-include threadId if present, else fallback to main threadId
        const itemThreadId = item.threadId || threadId;
        messageIdToThreadIds[item.id] = itemThreadId;
        const itemThreadMessagesKey = this.getThreadMessagesKey(itemThreadId);

        // Get the rank of this message in the sorted set
        const rank = await this.redis.zrank(itemThreadMessagesKey, item.id);
        if (rank === null) continue;

        // Get previous messages if requested
        if (item.withPreviousMessages) {
          const start = Math.max(0, rank - item.withPreviousMessages);
          const prevIds = rank === 0 ? [] : await this.redis.zrange(itemThreadMessagesKey, start, rank - 1);
          prevIds.forEach(id => {
            messageIds.add(id as string);
            messageIdToThreadIds[id as string] = itemThreadId;
          });
        }

        // Get next messages if requested
        if (item.withNextMessages) {
          const nextIds = await this.redis.zrange(itemThreadMessagesKey, rank + 1, rank + item.withNextMessages);
          nextIds.forEach(id => {
            messageIds.add(id as string);
            messageIdToThreadIds[id as string] = itemThreadId;
          });
        }
      }

      const pipeline = this.redis.pipeline();
      Array.from(messageIds).forEach(id => {
        const tId = messageIdToThreadIds[id] || threadId;
        pipeline.get(this.getMessageKey(tId, id as string));
      });
      const results = await pipeline.exec();
      return results.filter(result => result !== null) as MastraMessageV2[] | MastraMessageV1[];
    }

    return [];
  }

  /**
   * @deprecated use getMessagesPaginated instead
   */
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages({
    threadId,
    selectBy,
    format,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    const threadMessagesKey = this.getThreadMessagesKey(threadId);
    try {
      const allMessageIds = await this.redis.zrange(threadMessagesKey, 0, -1);
      const limit = this.resolveMessageLimit({ last: selectBy?.last, defaultLimit: Number.MAX_SAFE_INTEGER });

      const messageIds = new Set<string>();
      const messageIdToThreadIds: Record<string, string> = {};

      if (limit === 0 && !selectBy?.include) {
        return [];
      }

      // Then get the most recent messages (or all if no limit)
      if (limit === Number.MAX_SAFE_INTEGER) {
        // Get all messages
        const allIds = await this.redis.zrange(threadMessagesKey, 0, -1);
        allIds.forEach(id => {
          messageIds.add(id as string);
          messageIdToThreadIds[id as string] = threadId;
        });
      } else if (limit > 0) {
        // Get limited number of recent messages
        const latestIds = await this.redis.zrange(threadMessagesKey, -limit, -1);
        latestIds.forEach(id => {
          messageIds.add(id as string);
          messageIdToThreadIds[id as string] = threadId;
        });
      }

      const includedMessages = await this._getIncludedMessages(threadId, selectBy);

      // Fetch all needed messages in parallel
      const messages = [
        ...includedMessages,
        ...((
          await Promise.all(
            Array.from(messageIds).map(async id => {
              const tId = messageIdToThreadIds[id] || threadId;
              const byThreadId = await this.redis.get<MastraMessageV2 & { _index?: number }>(
                this.getMessageKey(tId, id),
              );
              if (byThreadId) return byThreadId;

              return null;
            }),
          )
        ).filter(msg => msg !== null) as (MastraMessageV2 & { _index?: number })[]),
      ];

      // Sort messages by their position in the sorted set
      messages.sort((a, b) => allMessageIds.indexOf(a!.id) - allMessageIds.indexOf(b!.id));

      const seen = new Set<string>();
      const dedupedMessages = messages.filter(row => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });

      // Remove _index before returning and handle format conversion properly
      const prepared = dedupedMessages
        .filter(message => message !== null && message !== undefined)
        .map(message => {
          const { _index, ...messageWithoutIndex } = message as MastraMessageV2 & { _index?: number };
          return messageWithoutIndex as unknown as MastraMessageV1;
        });

      // For backward compatibility, return messages directly without using MessageList
      // since MessageList has deduplication logic that can cause issues
      if (format === 'v2') {
        // Convert V1 format back to V2 format
        return prepared.map(msg => ({
          ...msg,
          createdAt: new Date(msg.createdAt),
          content: msg.content || { format: 2, parts: [{ type: 'text', text: '' }] },
        })) as MastraMessageV2[];
      }

      return prepared.map(msg => ({
        ...msg,
        createdAt: new Date(msg.createdAt),
      }));
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId,
          },
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
    const { threadId, selectBy, format } = args;
    const { page = 0, perPage = 40, dateRange } = selectBy?.pagination || {};
    const fromDate = dateRange?.start;
    const toDate = dateRange?.end;
    const threadMessagesKey = this.getThreadMessagesKey(threadId);
    const messages: (MastraMessageV2 | MastraMessageV1)[] = [];

    try {
      const includedMessages = await this._getIncludedMessages(threadId, selectBy);

      messages.push(...includedMessages);

      const allMessageIds = await this.redis.zrange(threadMessagesKey, args?.selectBy?.last ? -args.selectBy.last : 0, -1);
      if (allMessageIds.length === 0) {
        return {
          messages: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      // Use pipeline to fetch all messages efficiently
      const pipeline = this.redis.pipeline();
      allMessageIds.forEach(id => pipeline.get(this.getMessageKey(threadId, id as string)));
      const results = await pipeline.exec();

      // Process messages and apply filters - handle undefined results from pipeline
      let messagesData = results.filter((msg): msg is MastraMessageV2 | MastraMessageV1 => msg !== null) as (
        | MastraMessageV2
        | MastraMessageV1
      )[];

      // Apply date filters if provided
      if (fromDate) {
        messagesData = messagesData.filter(msg => msg && new Date(msg.createdAt).getTime() >= fromDate.getTime());
      }

      if (toDate) {
        messagesData = messagesData.filter(msg => msg && new Date(msg.createdAt).getTime() <= toDate.getTime());
      }

      // Sort messages by their position in the sorted set
      messagesData.sort((a, b) => allMessageIds.indexOf(a!.id) - allMessageIds.indexOf(b!.id));

      const total = messagesData.length;

      const start = page * perPage;
      const end = start + perPage;
      const hasMore = end < total;
      const paginatedMessages = messagesData.slice(start, end);

      messages.push(...paginatedMessages);

      const list = new MessageList().add(messages, 'memory');
      const finalMessages = (format === `v2` ? list.get.all.v2() : list.get.all.v1()) as
        | MastraMessageV1[]
        | MastraMessageV2[];

      return {
        messages: finalMessages,
        total,
        page,
        perPage,
        hasMore,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_MESSAGES_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            threadId,
          },
        },
        error,
      );
      this.logger.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return {
        messages: [],
        total: 0,
        page,
        perPage,
        hasMore: false,
      };
    }
  }

  async persistWorkflowSnapshot(params: {
    namespace: string;
    workflowName: string;
    runId: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    const { namespace = 'workflows', workflowName, runId, snapshot } = params;
    try {
      await this.insert({
        tableName: TABLE_WORKFLOW_SNAPSHOT,
        record: {
          namespace,
          workflow_name: workflowName,
          run_id: runId,
          snapshot,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_PERSIST_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            namespace,
            workflowName,
            runId,
          },
        },
        error,
      );
    }
  }

  async loadWorkflowSnapshot(params: {
    namespace: string;
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    const { namespace = 'workflows', workflowName, runId } = params;
    const key = this.getKey(TABLE_WORKFLOW_SNAPSHOT, {
      namespace,
      workflow_name: workflowName,
      run_id: runId,
    });
    try {
      const data = await this.redis.get<{
        namespace: string;
        workflow_name: string;
        run_id: string;
        snapshot: WorkflowRunState;
      }>(key);
      if (!data) return null;
      return data.snapshot;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_LOAD_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            namespace,
            workflowName,
            runId,
          },
        },
        error,
      );
    }
  }

  /**
   * Get all evaluations with pagination and total count
   * @param options Pagination and filtering options
   * @returns Object with evals array and total count
   */
  async getEvals(
    options?: {
      agentName?: string;
      type?: 'test' | 'live';
    } & PaginationArgs,
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    try {
      // Default pagination parameters
      const { agentName, type, page = 0, perPage = 100, dateRange } = options || {};
      const fromDate = dateRange?.start;
      const toDate = dateRange?.end;

      // Get all keys that match the evals table pattern using cursor-based scanning
      const pattern = `${TABLE_EVALS}:*`;
      const keys = await this.scanKeys(pattern);

      // Check if we have any keys before using pipeline
      if (keys.length === 0) {
        return {
          evals: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      // Use pipeline for batch fetching to improve performance
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      // Process results and apply filters
      let filteredEvals = results
        .map((result: any) => result as Record<string, any> | null)
        .filter((record): record is Record<string, any> => record !== null && typeof record === 'object');

      // Apply agent name filter if provided
      if (agentName) {
        filteredEvals = filteredEvals.filter(record => record.agent_name === agentName);
      }

      // Apply type filter if provided
      if (type === 'test') {
        filteredEvals = filteredEvals.filter(record => {
          if (!record.test_info) return false;

          try {
            if (typeof record.test_info === 'string') {
              const parsedTestInfo = JSON.parse(record.test_info);
              return parsedTestInfo && typeof parsedTestInfo === 'object' && 'testPath' in parsedTestInfo;
            }
            return typeof record.test_info === 'object' && 'testPath' in record.test_info;
          } catch {
            return false;
          }
        });
      } else if (type === 'live') {
        filteredEvals = filteredEvals.filter(record => {
          if (!record.test_info) return true;

          try {
            if (typeof record.test_info === 'string') {
              const parsedTestInfo = JSON.parse(record.test_info);
              return !(parsedTestInfo && typeof parsedTestInfo === 'object' && 'testPath' in parsedTestInfo);
            }
            return !(typeof record.test_info === 'object' && 'testPath' in record.test_info);
          } catch {
            return true;
          }
        });
      }

      // Apply date filters if provided
      if (fromDate) {
        filteredEvals = filteredEvals.filter(record => {
          const createdAt = new Date(record.created_at || record.createdAt || 0);
          return createdAt.getTime() >= fromDate.getTime();
        });
      }

      if (toDate) {
        filteredEvals = filteredEvals.filter(record => {
          const createdAt = new Date(record.created_at || record.createdAt || 0);
          return createdAt.getTime() <= toDate.getTime();
        });
      }

      // Sort by creation date (newest first)
      filteredEvals.sort((a, b) => {
        const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
        const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
        return dateB - dateA;
      });

      const total = filteredEvals.length;

      // Apply pagination
      const start = page * perPage;
      const end = start + perPage;
      const paginatedEvals = filteredEvals.slice(start, end);
      const hasMore = end < total;

      // Transform to EvalRow format
      const evals = paginatedEvals.map(record => this.transformEvalRecord(record));

      return {
        evals,
        total,
        page,
        perPage,
        hasMore,
      };
    } catch (error) {
      const { page = 0, perPage = 100 } = options || {};
      const mastraError = new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_EVALS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            page,
            perPage,
          },
        },
        error,
      );
      this.logger.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return {
        evals: [],
        total: 0,
        page,
        perPage,
        hasMore: false,
      };
    }
  }

  async getWorkflowRuns(
    {
      namespace,
      workflowName,
      fromDate,
      toDate,
      limit,
      offset,
      resourceId,
    }: {
      namespace: string;
      workflowName?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
      resourceId?: string;
    } = { namespace: 'workflows' },
  ): Promise<WorkflowRuns> {
    try {
      // Get all workflow keys
      let pattern = this.getKey(TABLE_WORKFLOW_SNAPSHOT, { namespace }) + ':*';
      if (workflowName && resourceId) {
        pattern = this.getKey(TABLE_WORKFLOW_SNAPSHOT, {
          namespace,
          workflow_name: workflowName,
          run_id: '*',
          resourceId,
        });
      } else if (workflowName) {
        pattern = this.getKey(TABLE_WORKFLOW_SNAPSHOT, { namespace, workflow_name: workflowName }) + ':*';
      } else if (resourceId) {
        pattern = this.getKey(TABLE_WORKFLOW_SNAPSHOT, { namespace, workflow_name: '*', run_id: '*', resourceId });
      }
      const keys = await this.scanKeys(pattern);

      // Check if we have any keys before using pipeline
      if (keys.length === 0) {
        return { runs: [], total: 0 };
      }

      // Use pipeline for batch fetching to improve performance
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();

      // Filter and transform results - handle undefined results
      let runs = results
        .map((result: any) => result as Record<string, any> | null)
        .filter(
          (record): record is Record<string, any> =>
            record !== null && record !== undefined && typeof record === 'object' && 'workflow_name' in record,
        )
        // Only filter by workflowName if it was specifically requested
        .filter(record => !workflowName || record.workflow_name === workflowName)
        .map(w => this.parseWorkflowRun(w!))
        .filter(w => {
          if (fromDate && w.createdAt < fromDate) return false;
          if (toDate && w.createdAt > toDate) return false;
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const total = runs.length;

      // Apply pagination if requested
      if (limit !== undefined && offset !== undefined) {
        runs = runs.slice(offset, offset + limit);
      }

      return { runs, total };
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_WORKFLOW_RUNS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            namespace,
            workflowName: workflowName || '',
            resourceId: resourceId || '',
          },
        },
        error,
      );
    }
  }

  async getWorkflowRunById({
    namespace = 'workflows',
    runId,
    workflowName,
  }: {
    namespace: string;
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    try {
      const key = this.getKey(TABLE_WORKFLOW_SNAPSHOT, { namespace, workflow_name: workflowName, run_id: runId }) + '*';
      const keys = await this.scanKeys(key);
      const workflows = await Promise.all(
        keys.map(async key => {
          const data = await this.redis.get<{
            workflow_name: string;
            run_id: string;
            snapshot: WorkflowRunState | string;
            createdAt: string | Date;
            updatedAt: string | Date;
            resourceId: string;
          }>(key);
          return data;
        }),
      );
      const data = workflows.find(w => w?.run_id === runId && w?.workflow_name === workflowName) as WorkflowRun | null;
      if (!data) return null;
      return this.parseWorkflowRun(data);
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_GET_WORKFLOW_RUN_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            namespace,
            runId,
            workflowName: workflowName || '',
          },
        },
        error,
      );
    }
  }

  async close(): Promise<void> {
    // No explicit cleanup needed for Upstash Redis
  }

  async updateMessages(args: {
    messages: (Partial<Omit<MastraMessageV2, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[]
  }): Promise<MastraMessageV2[]> {
    const { messages } = args;

    if (messages.length === 0) {
      return [];
    }

    try {
      // Get all message IDs to update
      const messageIds = messages.map(m => m.id);

      // Find all existing messages by scanning for their keys
      const existingMessages: (MastraMessageV2 | MastraMessageV1)[] = [];
      const messageIdToKey: Record<string, string> = {};

      // Scan for all message keys that match any of the IDs
      for (const messageId of messageIds) {
        const pattern = this.getMessageKey('*', messageId);
        const keys = await this.scanKeys(pattern);

        for (const key of keys) {
          const message = await this.redis.get<MastraMessageV2 | MastraMessageV1>(key);
          if (message && message.id === messageId) {
            existingMessages.push(message);
            messageIdToKey[messageId] = key;
            break; // Found the message, no need to continue scanning
          }
        }
      }

      if (existingMessages.length === 0) {
        return [];
      }

      const threadIdsToUpdate = new Set<string>();
      const pipeline = this.redis.pipeline();

      // Process each existing message for updates
      for (const existingMessage of existingMessages) {
        const updatePayload = messages.find(m => m.id === existingMessage.id);
        if (!updatePayload) continue;

        const { id, ...fieldsToUpdate } = updatePayload;
        if (Object.keys(fieldsToUpdate).length === 0) continue;

        // Track thread IDs that need updating
        threadIdsToUpdate.add(existingMessage.threadId!);
        if (updatePayload.threadId && updatePayload.threadId !== existingMessage.threadId) {
          threadIdsToUpdate.add(updatePayload.threadId);
        }

        // Create updated message object
        const updatedMessage = { ...existingMessage };

        // Special handling for the content field to merge instead of overwrite
        if (fieldsToUpdate.content) {
          const existingContent = existingMessage.content as MastraMessageContentV2;
          const newContent = {
            ...existingContent,
            ...fieldsToUpdate.content,
            // Deep merge metadata if it exists on both
            ...(existingContent?.metadata && fieldsToUpdate.content.metadata
              ? {
                metadata: {
                  ...existingContent.metadata,
                  ...fieldsToUpdate.content.metadata,
                },
              }
              : {}),
          };
          updatedMessage.content = newContent;
        }

        // Update other fields
        for (const key in fieldsToUpdate) {
          if (Object.prototype.hasOwnProperty.call(fieldsToUpdate, key) && key !== 'content') {
            (updatedMessage as any)[key] = fieldsToUpdate[key as keyof typeof fieldsToUpdate];
          }
        }

        // Update the message in Redis
        const key = messageIdToKey[id];
        if (key) {
          // If the message is being moved to a different thread, we need to handle the key change
          if (updatePayload.threadId && updatePayload.threadId !== existingMessage.threadId) {
            // Remove from old thread's sorted set
            const oldThreadMessagesKey = this.getThreadMessagesKey(existingMessage.threadId!);
            pipeline.zrem(oldThreadMessagesKey, id);

            // Delete the old message key
            pipeline.del(key);

            // Create new message key with new threadId
            const newKey = this.getMessageKey(updatePayload.threadId, id);
            pipeline.set(newKey, updatedMessage);

            // Add to new thread's sorted set
            const newThreadMessagesKey = this.getThreadMessagesKey(updatePayload.threadId);
            const score = (updatedMessage as any)._index !== undefined ? (updatedMessage as any)._index : new Date(updatedMessage.createdAt).getTime();
            pipeline.zadd(newThreadMessagesKey, { score, member: id });
          } else {
            // No thread change, just update the existing key
            pipeline.set(key, updatedMessage);
          }
        }
      }

      // Update thread timestamps
      const now = new Date();
      for (const threadId of threadIdsToUpdate) {
        if (threadId) {
          const threadKey = this.getKey(TABLE_THREADS, { id: threadId });
          const existingThread = await this.redis.get<StorageThreadType>(threadKey);
          if (existingThread) {
            const updatedThread = {
              ...existingThread,
              updatedAt: now,
            };
            pipeline.set(threadKey, processRecord(TABLE_THREADS, updatedThread).processedRecord);
          }
        }
      }

      // Execute all updates
      await pipeline.exec();

      // Return the updated messages
      const updatedMessages: MastraMessageV2[] = [];
      for (const messageId of messageIds) {
        const key = messageIdToKey[messageId];
        if (key) {
          const updatedMessage = await this.redis.get<MastraMessageV2 | MastraMessageV1>(key);
          if (updatedMessage) {
            // Convert to V2 format if needed
            const v2e = updatedMessage as MastraMessageV2;
            updatedMessages.push(v2e);
          }
        }
      }

      return updatedMessages;
    } catch (error) {
      throw new MastraError(
        {
          id: 'STORAGE_UPSTASH_STORAGE_UPDATE_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            messageIds: messages.map(m => m.id).join(','),
          },
        },
        error,
      );
    }
  }

  async getResourceById({ resourceId }: { resourceId: string }): Promise<StorageResourceType | null> {
    try {
      const key = `${TABLE_RESOURCES}:${resourceId}`;
      const data = await this.redis.get<StorageResourceType>(key);

      if (!data) {
        return null;
      }

      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        // Ensure workingMemory is always returned as a string, regardless of automatic parsing
        workingMemory: typeof data.workingMemory === 'object' ? JSON.stringify(data.workingMemory) : data.workingMemory,
        metadata: typeof data.metadata === 'string' ? JSON.parse(data.metadata) : data.metadata,
      };
    } catch (error) {
      this.logger.error('Error getting resource by ID:', error);
      throw error;
    }
  }

  async saveResource({ resource }: { resource: StorageResourceType }): Promise<StorageResourceType> {
    try {
      const key = `${TABLE_RESOURCES}:${resource.id}`;
      const serializedResource = {
        ...resource,
        metadata: JSON.stringify(resource.metadata),
        createdAt: resource.createdAt.toISOString(),
        updatedAt: resource.updatedAt.toISOString(),
      };

      await this.redis.set(key, serializedResource);

      return resource;
    } catch (error) {
      this.logger.error('Error saving resource:', error);
      throw error;
    }
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
    try {
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

      await this.saveResource({ resource: updatedResource });
      return updatedResource;
    } catch (error) {
      this.logger.error('Error updating resource:', error);
      throw error;
    }
  }

  async getScoreById({ id: _id }: { id: string }): Promise<ScoreRowData | null> {
    return this.stores.scores.getScoreById({ id: _id });
  }

  async saveScore(_score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    return this.stores.scores.saveScore(_score);
  }

  async getScoresByRunId({
    runId: _runId,
    pagination: _pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    return this.stores.scores.getScoresByRunId({ runId: _runId, pagination: _pagination });
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
    return this.stores.scores.getScoresByEntityId({ entityId: _entityId, entityType: _entityType, pagination: _pagination });
  }

  async getScoresByScorerId({
    scorerId: _scorerId,
    pagination: _pagination,
  }: {
    scorerId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    return this.stores.scores.getScoresByScorerId({ scorerId: _scorerId, pagination: _pagination });
  }
}
