import { MessageList } from '@mastra/core/agent';
import type { MastraMessageContentV2, MastraMessageV2 } from '@mastra/core/agent';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { MastraMessageV1, StorageThreadType } from '@mastra/core/memory';
import {
  MemoryStorage,
  resolveMessageLimit,
  TABLE_MESSAGES,
  TABLE_RESOURCES,
  TABLE_THREADS,
} from '@mastra/core/storage';
import type { PaginationInfo, StorageGetMessagesArg, StorageResourceType } from '@mastra/core/storage';
import { createSqlBuilder } from '../../sql-builder';
import type { StoreOperationsD1 } from '../operations';

export class MemoryD1 extends MemoryStorage {
  private operations: StoreOperationsD1;

  constructor({ operations }: { operations: StoreOperationsD1 }) {
    super();
    this.operations = operations;
  }

  private ensureDate(date: Date | string | undefined): Date | undefined {
    if (!date) return undefined;
    return date instanceof Date ? date : new Date(date);
  }

  private async _getIncludedMessages(threadId: string, selectBy: StorageGetMessagesArg['selectBy']) {
    const include = selectBy?.include;
    if (!include) return null;

    const prevMax = Math.max(...include.map(i => i.withPreviousMessages || 0));
    const nextMax = Math.max(...include.map(i => i.withNextMessages || 0));
    const includeIds = include.map(i => i.id);

    const sql = `
      WITH ordered_messages AS (
        SELECT
          *,
          ROW_NUMBER() OVER (ORDER BY createdAt DESC) AS row_num
        FROM ${TABLE_MESSAGES}
        WHERE thread_id = ?
      )
      SELECT
        m.id,
        m.content,
        m.role,
        m.type,
        m.createdAt,
        m.thread_id AS threadId,
        m.resourceId
      FROM ordered_messages m
      WHERE m.id IN (${includeIds.map(() => '?').join(',')})
      OR EXISTS (
        SELECT 1 FROM ordered_messages target
        WHERE target.id IN (${includeIds.map(() => '?').join(',')})
        AND (
          (m.row_num <= target.row_num + ? AND m.row_num > target.row_num)
          OR
          (m.row_num >= target.row_num - ? AND m.row_num < target.row_num)
        )
      )
      ORDER BY m.createdAt DESC
    `;

    const params = [
      threadId,
      ...includeIds,
      ...includeIds,
      prevMax,
      nextMax,
    ];

    return await this.operations.executeQuery({ sql, params });
  }

  async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  async getMessages({
    threadId,
    selectBy,
    format,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    const limit = resolveMessageLimit({
      last: selectBy?.last,
      defaultLimit: 40,
    });
    const include = selectBy?.include || [];
    const messages: any[] = [];

    try {
      if (include.length) {
        const includeResult = await this._getIncludedMessages(threadId, selectBy);
        if (Array.isArray(includeResult)) messages.push(...includeResult);
      }

      const excludeIds = messages.map(m => m.id);
      const query = createSqlBuilder()
        .select(['id', 'content', 'role', 'type', 'createdAt', 'thread_id AS threadId', 'resourceId'])
        .from(TABLE_MESSAGES)
        .where('thread_id = ?', threadId);

      if (excludeIds.length > 0) {
        query.andWhere(`id NOT IN (${excludeIds.map(() => '?').join(',')})`, ...excludeIds);
      }

      query.orderBy('createdAt', 'DESC').limit(limit);

      const { sql, params } = query.build();
      const result = await this.operations.executeQuery({ sql, params });

      if (Array.isArray(result)) messages.push(...result);

      messages.sort((a, b) => {
        const timeA = new Date(a.createdAt as string).getTime();
        const timeB = new Date(b.createdAt as string).getTime();
        return timeA - timeB;
      });

      const processedMessages = messages.map(message => {
        const processedMsg: Record<string, any> = {};

        for (const [key, value] of Object.entries(message)) {
          if (key === `type` && value === `v2`) continue;
          processedMsg[key] = this.deserializeValue(value);
        }

        return processedMsg;
      });

      this.logger.debug(`Retrieved ${messages.length} messages for thread ${threadId}`);
      const list = new MessageList().add(processedMessages as MastraMessageV1[] | MastraMessageV2[], 'memory');
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_MESSAGES_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to retrieve messages for thread ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          details: { threadId },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      throw mastraError;
    }
  }

  private deserializeValue(value: any): any {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        return JSON.parse(value) as Record<string, any>;
      } catch {
        return value;
      }
    }

    return value;
  }

  async getMessagesPaginated({
    threadId,
    selectBy,
    format,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<
    PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }
  > {
    const { dateRange, page = 0, perPage = 40 } = selectBy?.pagination || {};
    const { start: fromDate, end: toDate } = dateRange || {};

    const messages: any[] = [];

    try {
      if (selectBy?.include?.length) {
        const includeResult = await this._getIncludedMessages(threadId, selectBy);
        if (Array.isArray(includeResult)) messages.push(...includeResult);
      }

      const countQuery = createSqlBuilder().count().from(TABLE_MESSAGES).where('thread_id = ?', threadId);

      if (fromDate) {
        countQuery.andWhere('createdAt >= ?', fromDate.toISOString());
      }
      if (toDate) {
        countQuery.andWhere('createdAt <= ?', toDate.toISOString());
      }

      const countResult = (await this.operations.executeQuery(countQuery.build())) as {
        count: number;
      }[];
      const total = Number(countResult[0]?.count ?? 0);

      const query = createSqlBuilder()
        .select(['id', 'content', 'role', 'type', 'createdAt', 'thread_id AS threadId', 'resourceId'])
        .from(TABLE_MESSAGES)
        .where('thread_id = ?', threadId);

      if (fromDate) {
        query.andWhere('createdAt >= ?', fromDate.toISOString());
      }
      if (toDate) {
        query.andWhere('createdAt <= ?', toDate.toISOString());
      }

      query
        .orderBy('createdAt', 'DESC')
        .limit(perPage)
        .offset(page * perPage);

      const results = (await this.operations.executeQuery(query.build())) as any[];
      const list = new MessageList().add(results as MastraMessageV1[] | MastraMessageV2[], 'memory');
      messages.push(...(format === `v2` ? list.get.all.v2() : list.get.all.v1()));

      return {
        messages,
        total,
        page,
        perPage,
        hasMore: page * perPage + messages.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_MESSAGES_PAGINATED_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to retrieve messages for thread ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          details: { threadId },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
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

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(args: {
    messages: MastraMessageV1[] | MastraMessageV2[];
    format?: undefined | 'v1' | 'v2';
  }): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    const { messages, format = 'v1' } = args;
    if (messages.length === 0) return [];

    try {
      const now = new Date();
      const threadId = messages[0]?.threadId;

      for (const [i, message] of messages.entries()) {
        if (!message.id) throw new Error(`Message at index ${i} missing id`);
        if (!message.threadId) {
          throw new Error(`Message at index ${i} missing threadId`);
        }
        if (!message.content) {
          throw new Error(`Message at index ${i} missing content`);
        }
        if (!message.role) {
          throw new Error(`Message at index ${i} missing role`);
        }
        const thread = await this.getThreadById({ threadId: message.threadId });
        if (!thread) {
          throw new Error(`Thread ${message.threadId} not found`);
        }
      }

      const messagesToInsert = messages.map(message => {
        const createdAt = message.createdAt ? new Date(message.createdAt) : now;
        return {
          id: message.id,
          thread_id: message.threadId,
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          createdAt: createdAt.toISOString(),
          role: message.role,
          type: message.type || 'v2',
          resourceId: message.resourceId,
        };
      });

      await Promise.all([
        this.batchUpsert({
          tableName: TABLE_MESSAGES,
          records: messagesToInsert,
        }),
        this.operations.executeQuery({
          sql: `UPDATE ${TABLE_THREADS} SET updatedAt = ? WHERE id = ?`,
          params: [now.toISOString(), threadId],
        }),
      ]);

      this.logger.debug(`Saved ${messages.length} messages`);
      const list = new MessageList().add(messages, 'memory');
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_SAVE_MESSAGES_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to save messages: ${error instanceof Error ? error.message : String(error)}`,
        },
        error,
      );
    }
  }

  private async batchUpsert({
    tableName,
    records,
  }: {
    tableName: string;
    records: Record<string, any>[];
  }): Promise<void> {
    if (records.length === 0) return;

    const batchSize = 50;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      for (const record of batch) {
        const processedRecord: Record<string, any> = {};
        for (const [key, value] of Object.entries(record)) {
          processedRecord[key] = this.serializeValue(value);
        }

        const columns = Object.keys(processedRecord);
        const values = Object.values(processedRecord);

        const recordToUpsert = columns.reduce(
          (acc, col) => {
            if (col !== 'createdAt') acc[col] = `excluded.${col}`;
            return acc;
          },
          {} as Record<string, any>,
        );

        const query = createSqlBuilder().insert(tableName, columns, values, ['id'], recordToUpsert);
        const { sql, params } = query.build();
        await this.operations.executeQuery({ sql, params });
      }
    }
  }

  private serializeValue(value: any): any {
    if (value === null || value === undefined) return null;

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value;
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
    const placeholders = messageIds.map(() => '?').join(',');

    const selectSql = `SELECT * FROM ${TABLE_MESSAGES} WHERE id IN (${placeholders})`;
    const existingResult = await this.operations.executeQuery({ sql: selectSql, params: messageIds });
    const existingMessages: MastraMessageV2[] = Array.isArray(existingResult) 
      ? existingResult.map(row => this.parseRow(row)) 
      : [];

    if (existingMessages.length === 0) {
      return [];
    }

    const threadIdsToUpdate = new Set<string>();
    const columnMapping: Record<string, string> = {
      threadId: 'thread_id',
    };

    for (const existingMessage of existingMessages) {
      const updatePayload = messages.find(m => m.id === existingMessage.id);
      if (!updatePayload) continue;

      const { id, ...fieldsToUpdate } = updatePayload;
      if (Object.keys(fieldsToUpdate).length === 0) continue;

      threadIdsToUpdate.add(existingMessage.threadId!);
      if (updatePayload.threadId && updatePayload.threadId !== existingMessage.threadId) {
        threadIdsToUpdate.add(updatePayload.threadId);
      }

      const setClauses = [];
      const args: any[] = [];
      const updatableFields = { ...fieldsToUpdate };

      if (updatableFields.content) {
        const newContent = {
          ...existingMessage.content,
          ...updatableFields.content,
          ...(existingMessage.content?.metadata && updatableFields.content.metadata
            ? {
                metadata: {
                  ...existingMessage.content.metadata,
                  ...updatableFields.content.metadata,
                },
              }
            : {}),
        };
        setClauses.push(`content = ?`);
        args.push(JSON.stringify(newContent));
        delete updatableFields.content;
      }

      for (const key in updatableFields) {
        if (Object.prototype.hasOwnProperty.call(updatableFields, key)) {
          const dbKey = columnMapping[key] || key;
          setClauses.push(`${dbKey} = ?`);
          let value = updatableFields[key as keyof typeof updatableFields];

          if (typeof value === 'object' && value !== null) {
            value = JSON.stringify(value);
          }
          args.push(value);
        }
      }

      if (setClauses.length === 0) continue;

      args.push(id);

      const sql = `UPDATE ${TABLE_MESSAGES} SET ${setClauses.join(', ')} WHERE id = ?`;
      await this.operations.executeQuery({ sql, params: args });
    }

    const now = new Date().toISOString();
    for (const threadId of threadIdsToUpdate) {
      if (threadId) {
        await this.operations.executeQuery({
          sql: `UPDATE ${TABLE_THREADS} SET updatedAt = ? WHERE id = ?`,
          params: [now, threadId],
        });
      }
    }

    const updatedResult = await this.operations.executeQuery({ sql: selectSql, params: messageIds });
    return Array.isArray(updatedResult) ? updatedResult.map(row => this.parseRow(row)) : [];
  }

  private parseRow(row: any): MastraMessageV2 {
    let content = row.content;
    try {
      content = JSON.parse(row.content);
    } catch {
      // use content as is if it's not JSON
    }
    const result = {
      id: row.id,
      content,
      role: row.role,
      createdAt: new Date(row.createdAt as string),
      threadId: row.thread_id,
      resourceId: row.resourceId,
    } as MastraMessageV2;
    if (row.type && row.type !== `v2`) result.type = row.type;
    return result;
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    const thread = await this.operations.load<StorageThreadType>({
      tableName: TABLE_THREADS,
      keys: { id: threadId },
    });

    if (!thread) return null;

    try {
      return {
        ...thread,
        createdAt: this.ensureDate(thread.createdAt) as Date,
        updatedAt: this.ensureDate(thread.updatedAt) as Date,
        metadata:
          typeof thread.metadata === 'string'
            ? (JSON.parse(thread.metadata || '{}') as Record<string, any>)
            : thread.metadata || {},
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_THREAD_BY_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Error processing thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
          details: { threadId },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return null;
    }
  }

  async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    try {
      const query = createSqlBuilder().select('*').from(TABLE_THREADS).where('resourceId = ?', resourceId);
      const { sql, params } = query.build();
      const results = await this.operations.executeQuery({ sql, params });

      return Array.isArray(results) 
        ? results.map((thread: any) => ({
            ...thread,
            createdAt: this.ensureDate(thread.createdAt) as Date,
            updatedAt: this.ensureDate(thread.updatedAt) as Date,
            metadata:
              typeof thread.metadata === 'string'
                ? (JSON.parse(thread.metadata || '{}') as Record<string, any>)
                : thread.metadata || {},
          }))
        : [];
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_THREADS_BY_RESOURCE_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Error getting threads by resourceId ${resourceId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          details: { resourceId },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return [];
    }
  }

  async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page: number;
    perPage: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    const { resourceId, page, perPage } = args;

    const mapRowToStorageThreadType = (row: Record<string, any>): StorageThreadType => ({
      ...(row as StorageThreadType),
      createdAt: this.ensureDate(row.createdAt) as Date,
      updatedAt: this.ensureDate(row.updatedAt) as Date,
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata || '{}') as Record<string, any>)
          : row.metadata || {},
    });

    try {
      const countQuery = createSqlBuilder().count().from(TABLE_THREADS).where('resourceId = ?', resourceId);
      const countResult = (await this.operations.executeQuery(countQuery.build())) as {
        count: number;
      }[];
      const total = Number(countResult?.[0]?.count ?? 0);

      const selectQuery = createSqlBuilder()
        .select('*')
        .from(TABLE_THREADS)
        .where('resourceId = ?', resourceId)
        .orderBy('createdAt', 'DESC')
        .limit(perPage)
        .offset(page * perPage);

      const results = (await this.operations.executeQuery(selectQuery.build())) as Record<string, any>[];
      const threads = results.map(mapRowToStorageThreadType);

      return {
        threads,
        total,
        page,
        perPage,
        hasMore: page * perPage + threads.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Error getting threads by resourceId ${resourceId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          details: { resourceId },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
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
    const threadToSave = {
      id: thread.id,
      resourceId: thread.resourceId,
      title: thread.title,
      metadata: thread.metadata ? JSON.stringify(thread.metadata) : null,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };

    const processedRecord: Record<string, any> = {};
    for (const [key, value] of Object.entries(threadToSave)) {
      processedRecord[key] = this.serializeValue(value);
    }

    const columns = Object.keys(processedRecord);
    const values = Object.values(processedRecord);

    const updateMap: Record<string, string> = {
      resourceId: 'excluded.resourceId',
      title: 'excluded.title',
      metadata: 'excluded.metadata',
      createdAt: 'excluded.createdAt',
      updatedAt: 'excluded.updatedAt',
    };

    const query = createSqlBuilder().insert(TABLE_THREADS, columns, values, ['id'], updateMap);
    const { sql, params } = query.build();

    try {
      await this.operations.executeQuery({ sql, params });
      return thread;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_SAVE_THREAD_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to save thread: ${error instanceof Error ? error.message : String(error)}`,
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
    const thread = await this.getThreadById({ threadId: id });
    try {
      if (!thread) {
        throw new Error(`Thread ${id} not found`);
      }

      const mergedMetadata = {
        ...(typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata),
        ...(metadata as Record<string, any>),
      };

      const columns = ['title', 'metadata', 'updatedAt'];
      const values = [title, JSON.stringify(mergedMetadata), new Date().toISOString()];

      const query = createSqlBuilder().update(TABLE_THREADS, columns, values).where('id = ?', id);
      const { sql, params } = query.build();

              await this.operations.executeQuery({ sql, params });

      return {
        ...thread,
        title,
        metadata: {
          ...(typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata),
          ...(metadata as Record<string, any>),
        },
        updatedAt: new Date(),
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_UPDATE_THREAD_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to update thread ${id}: ${error instanceof Error ? error.message : String(error)}`,
          details: { threadId: id },
        },
        error,
      );
    }
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    try {
      const deleteThreadQuery = createSqlBuilder().delete(TABLE_THREADS).where('id = ?', threadId);
      const { sql: threadSql, params: threadParams } = deleteThreadQuery.build();
      await this.operations.executeQuery({ sql: threadSql, params: threadParams });

      const deleteMessagesQuery = createSqlBuilder().delete(TABLE_MESSAGES).where('thread_id = ?', threadId);
      const { sql: messagesSql, params: messagesParams } = deleteMessagesQuery.build();
      await this.operations.executeQuery({ sql: messagesSql, params: messagesParams });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_DELETE_THREAD_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to delete thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
          details: { threadId },
        },
        error,
      );
    }
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
      workingMemory:
        result.workingMemory && typeof result.workingMemory === 'object'
          ? JSON.stringify(result.workingMemory)
          : result.workingMemory,
      metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata,
      createdAt: new Date(result.createdAt),
      updatedAt: new Date(result.updatedAt),
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

    const updates: string[] = [];
    const values: any[] = [];

    if (workingMemory !== undefined) {
      updates.push('workingMemory = ?');
      values.push(workingMemory);
    }

    if (metadata) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(updatedResource.metadata));
    }

    updates.push('updatedAt = ?');
    values.push(updatedResource.updatedAt.toISOString());

    values.push(resourceId);

    await this.operations.executeQuery({
      sql: `UPDATE ${TABLE_RESOURCES} SET ${updates.join(', ')} WHERE id = ?`,
      params: values,
    });

    return updatedResource;
  }
}