import type { ClickHouseClient } from '@clickhouse/client';
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
import type { PaginationInfo, StorageGetMessagesArg, StorageResourceType } from '@mastra/core/storage';
import type { StoreOperationsClickHouse } from '../operations';

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

function transformRows<R>(rows: any[]): R[] {
  return rows.map((row: any) => transformRow<R>(row));
}

export class MemoryClickHouse extends MemoryStorage {
  private client: ClickHouseClient;
  private operations: StoreOperationsClickHouse;

  constructor({
    client,
    operations,
  }: {
    client: ClickHouseClient;
    operations: StoreOperationsClickHouse;
  }) {
    super();
    this.client = client;
    this.operations = operations;
  }

  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    try {
      const result = await this.client.query({
        query: `SELECT 
          id,
          "resourceId",
          title,
          metadata,
          toDateTime64(createdAt, 3) as createdAt,
          toDateTime64(updatedAt, 3) as updatedAt
        FROM "${TABLE_THREADS}"
        WHERE id = {var_id:String}`,
        query_params: { var_id: threadId },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      const thread = transformRow(rows.data[0]) as StorageThreadType;

      if (!thread) {
        return null;
      }

      return {
        ...thread,
        metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_THREAD_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }

  /**
   * @deprecated use getThreadsByResourceIdPaginated instead
   */
  public async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    try {
      const result = await this.client.query({
        query: `SELECT 
          id,
          "resourceId",
          title,
          metadata,
          toDateTime64(createdAt, 3) as createdAt,
          toDateTime64(updatedAt, 3) as updatedAt
        FROM "${TABLE_THREADS}"
        WHERE "resourceId" = {var_resourceId:String}
        ORDER BY "createdAt" DESC`,
        query_params: { var_resourceId: resourceId },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      const threads = transformRows(rows.data) as StorageThreadType[];

      return threads.map((thread: StorageThreadType) => ({
        ...thread,
        metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      }));
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_THREADS_BY_RESOURCE_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId },
        },
        error,
      );
    }
  }

  public async getThreadsByResourceIdPaginated(args: {
    resourceId: string;
    page: number;
    perPage: number;
  }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
    const { resourceId, page = 0, perPage = 100 } = args;

    try {
      const offset = page * perPage;

      // Get total count
      const countResult = await this.client.query({
        query: `SELECT COUNT(*) as count FROM "${TABLE_THREADS}" WHERE "resourceId" = {var_resourceId:String}`,
        query_params: { var_resourceId: resourceId },
      });

      const countRows = await countResult.json();
      const total = Number(countRows.data[0]?.count ?? 0);

      if (total === 0) {
        return {
          threads: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      // Get paginated data
      const result = await this.client.query({
        query: `SELECT 
          id,
          "resourceId",
          title,
          metadata,
          toDateTime64(createdAt, 3) as createdAt,
          toDateTime64(updatedAt, 3) as updatedAt
        FROM "${TABLE_THREADS}"
        WHERE "resourceId" = {var_resourceId:String}
        ORDER BY "createdAt" DESC
        LIMIT {var_limit:Int64} OFFSET {var_offset:Int64}`,
        query_params: { 
          var_resourceId: resourceId,
          var_limit: perPage,
          var_offset: offset
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      const threads = transformRows(rows.data) as StorageThreadType[];

      const processedThreads = threads.map((thread: StorageThreadType) => ({
        ...thread,
        metadata: typeof thread.metadata === 'string' ? JSON.parse(thread.metadata) : thread.metadata,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      }));

      return {
        threads: processedThreads,
        total,
        page,
        perPage,
        hasMore: offset + threads.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_THREADS_BY_RESOURCE_ID_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { resourceId, page },
        },
        error,
      );
      this.logger?.error?.(mastraError.toString());
      this.logger?.trackException(mastraError);
      return { threads: [], total: 0, page, perPage, hasMore: false };
    }
  }

  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    try {
      await this.client.insert({
        table: TABLE_THREADS,
        values: [
          {
            ...thread,
            metadata: JSON.stringify(thread.metadata),
            createdAt: thread.createdAt.toISOString(),
            updatedAt: thread.updatedAt.toISOString(),
          },
        ],
        format: 'JSONEachRow',
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      return thread;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_SAVE_THREAD_FAILED',
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
    try {
      // First get the existing thread to merge metadata
      const existingThread = await this.getThreadById({ threadId: id });
      if (!existingThread) {
        throw new Error(`Thread ${id} not found`);
      }

      // Merge the existing metadata with the new metadata
      const mergedMetadata = {
        ...existingThread.metadata,
        ...metadata,
      };

      const updatedThread = {
        ...existingThread,
        title,
        metadata: mergedMetadata,
        updatedAt: new Date(),
      };

      await this.client.insert({
        table: TABLE_THREADS,
        format: 'JSONEachRow',
        values: [
          {
            id: updatedThread.id,
            resourceId: updatedThread.resourceId,
            title: updatedThread.title,
            metadata: JSON.stringify(updatedThread.metadata),
            createdAt: updatedThread.createdAt.toISOString(),
            updatedAt: updatedThread.updatedAt.toISOString(),
          },
        ],
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      return updatedThread;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_UPDATE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId: id, title },
        },
        error,
      );
    }
  }

  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    try {
      // First delete all messages associated with this thread
      await this.client.command({
        query: `DELETE FROM "${TABLE_MESSAGES}" WHERE thread_id = {var_thread_id:String};`,
        query_params: { var_thread_id: threadId },
        clickhouse_settings: {
          output_format_json_quote_64bit_integers: 0,
        },
      });

      // Then delete the thread
      await this.client.command({
        query: `DELETE FROM "${TABLE_THREADS}" WHERE id = {var_id:String};`,
        query_params: { var_id: threadId },
        clickhouse_settings: {
          output_format_json_quote_64bit_integers: 0,
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_DELETE_THREAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId },
        },
        error,
      );
    }
  }

  /**
   * @deprecated use getMessagesPaginated instead
   */
  public async getMessages(args: StorageGetMessagesArg & { format?: 'v1' }): Promise<MastraMessageV1[]>;
  public async getMessages(args: StorageGetMessagesArg & { format: 'v2' }): Promise<MastraMessageV2[]>;
  public async getMessages({
    threadId,
    resourceId,
    selectBy,
    format,
  }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<MastraMessageV1[] | MastraMessageV2[]> {
    try {
      const messages: any[] = [];
      const limit = resolveMessageLimit({ last: selectBy?.last, defaultLimit: 40 });
      const include = selectBy?.include || [];

      if (include.length) {
        const includeResult = await this.client.query({
          query: `
          WITH ordered_messages AS (
            SELECT 
              *,
              toDateTime64(createdAt, 3) as createdAt,
              ROW_NUMBER() OVER (ORDER BY "createdAt" DESC) as row_num
            FROM "${TABLE_MESSAGES}"
            WHERE thread_id = {var_thread_id:String}
          )
          SELECT
            m.id AS id, 
            m.content as content, 
            m.role as role, 
            m.type as type,
            m.createdAt as createdAt, 
            m.thread_id AS "threadId",
            m."resourceId" as "resourceId"
          FROM ordered_messages m
          WHERE m.id = ANY({var_include:Array(String)})
          OR EXISTS (
            SELECT 1 FROM ordered_messages target
            WHERE target.id = ANY({var_include:Array(String)})
            AND (
              -- Get previous messages based on the max withPreviousMessages
              (m.row_num <= target.row_num + {var_withPreviousMessages:Int64} AND m.row_num > target.row_num)
              OR
              -- Get next messages based on the max withNextMessages
              (m.row_num >= target.row_num - {var_withNextMessages:Int64} AND m.row_num < target.row_num)
            )
          )
          ORDER BY m."createdAt" DESC
          `,
          query_params: {
            var_thread_id: threadId,
            var_include: include.map(i => i.id),
            var_withPreviousMessages: Math.max(...include.map(i => i.withPreviousMessages || 0)),
            var_withNextMessages: Math.max(...include.map(i => i.withNextMessages || 0)),
          },
          clickhouse_settings: {
            date_time_input_format: 'best_effort',
            date_time_output_format: 'iso',
            use_client_time_zone: 1,
            output_format_json_quote_64bit_integers: 0,
          },
        });

        const rows = await includeResult.json();
        messages.push(...transformRows(rows.data));
      }

      // Then get the remaining messages, excluding the ids we just fetched
      const result = await this.client.query({
        query: `
        SELECT 
            id, 
            content, 
            role, 
            type,
            toDateTime64(createdAt, 3) as createdAt,
            thread_id AS "threadId",
            "resourceId"
        FROM "${TABLE_MESSAGES}"
        WHERE thread_id = {threadId:String}
        AND id NOT IN ({exclude:Array(String)})
        ORDER BY "createdAt" DESC
        LIMIT {limit:Int64}
        `,
        query_params: {
          threadId,
          exclude: messages.map(m => m.id),
          limit,
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      messages.push(...transformRows(rows.data));

      // Sort all messages by creation date
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Parse message content
      messages.forEach(message => {
        if (typeof message.content === 'string') {
          try {
            message.content = JSON.parse(message.content);
          } catch {
            // If parsing fails, leave as string
          }
        }
      });

      const list = new MessageList({ threadId, resourceId }).add(messages, 'memory');
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_MESSAGES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId, resourceId: resourceId ?? '' },
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
    const perPage = perPageInput !== undefined ? perPageInput : resolveMessageLimit({ last: selectBy?.last, defaultLimit: 40 });
    const fromDate = dateRange?.start;
    const toDate = dateRange?.end;

    const messages: any[] = [];

    if (selectBy?.include?.length) {
      // Handle included messages (similar to above implementation)
      const includeResult = await this.client.query({
        query: `
        WITH ordered_messages AS (
          SELECT 
            *,
            toDateTime64(createdAt, 3) as createdAt,
            ROW_NUMBER() OVER (ORDER BY "createdAt" DESC) as row_num
          FROM "${TABLE_MESSAGES}"
          WHERE thread_id = {var_thread_id:String}
        )
        SELECT
          m.id AS id, 
          m.content as content, 
          m.role as role, 
          m.type as type,
          m.createdAt as createdAt, 
          m.thread_id AS "threadId",
          m."resourceId" as "resourceId"
        FROM ordered_messages m
        WHERE m.id = ANY({var_include:Array(String)})
        ORDER BY m."createdAt" DESC
        `,
        query_params: {
          var_thread_id: threadId,
          var_include: selectBy.include.map(i => i.id),
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await includeResult.json();
      messages.push(...transformRows(rows.data));
    }

    try {
      const currentOffset = page * perPage;

      const conditions: string[] = [`thread_id = {var_threadId:String}`];
      const queryParams: Record<string, any> = { var_threadId: threadId };

      if (fromDate) {
        conditions.push(`"createdAt" >= {var_fromDate:DateTime64(3)}`);
        queryParams.var_fromDate = fromDate.getTime() / 1000;
      }
      if (toDate) {
        conditions.push(`"createdAt" <= {var_toDate:DateTime64(3)}`);
        queryParams.var_toDate = toDate.getTime() / 1000;
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await this.client.query({
        query: `SELECT COUNT(*) as count FROM ${TABLE_MESSAGES} ${whereClause}`,
        query_params: queryParams,
      });
      const countRows = await countResult.json();
      const total = Number(countRows.data[0]?.count ?? 0);

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
      const excludeCondition = excludeIds.length ? `AND id NOT IN (${excludeIds.map((_, i) => `{var_exclude_${i}:String}`).join(', ')})` : '';
      
      // Add exclude IDs to query params
      excludeIds.forEach((id, i) => {
        queryParams[`var_exclude_${i}`] = id;
      });
      
      queryParams.var_perPage = perPage;
      queryParams.var_offset = currentOffset;

      const dataResult = await this.client.query({
        query: `SELECT id, content, role, type, toDateTime64(createdAt, 3) as createdAt, thread_id as "threadId", "resourceId" FROM ${TABLE_MESSAGES} ${whereClause} ${excludeCondition} ORDER BY "createdAt" DESC LIMIT {var_perPage:Int64} OFFSET {var_offset:Int64}`,
        query_params: queryParams,
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await dataResult.json();
      messages.push(...transformRows(rows.data));

      // Parse message content
      messages.forEach(message => {
        if (typeof message.content === 'string') {
          try {
            message.content = JSON.parse(message.content);
          } catch {
            // If parsing fails, leave as string
          }
        }
      });

      const list = new MessageList({ threadId }).add(messages, 'memory');
      const messagesToReturn = format === 'v1' ? list.get.all.v1() : list.get.all.v2();

      return {
        messages: messagesToReturn,
        total,
        page,
        perPage,
        hasMore: currentOffset + rows.data.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_MESSAGES_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { threadId, page },
        },
        error,
      );
      this.logger?.error?.(mastraError.toString());
      this.logger?.trackException(mastraError);
      return { messages: [], total: 0, page, perPage, hasMore: false };
    }
  }

  async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
  async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
  async saveMessages(
    args: { messages: MastraMessageV1[]; format?: undefined | 'v1' } | { messages: MastraMessageV2[]; format: 'v2' },
  ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
    const { messages, format = 'v1' } = args;
    if (messages.length === 0) return messages;

    try {
      const threadId = messages[0]?.threadId;
      const resourceId = messages[0]?.resourceId;
      if (!threadId) {
        throw new Error('Thread ID is required');
      }

      // Check if thread exists
      const thread = await this.getThreadById({ threadId });
      if (!thread) {
        throw new Error(`Thread ${threadId} not found`);
      }

      // For ClickHouse, we need to handle potential duplicates
      const existingResult = await this.client.query({
        query: `SELECT id, thread_id FROM ${TABLE_MESSAGES} WHERE id IN ({ids:Array(String)})`,
        query_params: {
          ids: messages.map(m => m.id),
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
        format: 'JSONEachRow',
      });
      const existingRows: Array<{ id: string; thread_id: string }> = await existingResult.json();
      const existingSet = new Set(existingRows.map(row => `${row.id}::${row.thread_id}`));
      
      // Only insert new messages
      const toInsert = messages.filter(m => !existingSet.has(`${m.id}::${threadId}`));
      const toUpdate = messages.filter(m => existingSet.has(`${m.id}::${threadId}`));

      // Handle updates via ALTER TABLE UPDATE for existing messages
      const updatePromises = toUpdate.map(message =>
        this.client.command({
          query: `
            ALTER TABLE ${TABLE_MESSAGES}
            UPDATE content = {var_content:String}, role = {var_role:String}, type = {var_type:String}
            WHERE id = {var_id:String} AND thread_id = {var_thread_id:String}
          `,
          query_params: {
            var_content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            var_role: message.role,
            var_type: message.type || 'v2',
            var_id: message.id,
            var_thread_id: threadId,
          },
          clickhouse_settings: {
            date_time_input_format: 'best_effort',
            use_client_time_zone: 1,
            output_format_json_quote_64bit_integers: 0,
          },
        }),
      );

      // Execute message inserts and thread update in parallel for better performance
      await Promise.all([
        // Insert new messages
        toInsert.length > 0 ? this.client.insert({
          table: TABLE_MESSAGES,
          format: 'JSONEachRow',
          values: toInsert.map(message => ({
            id: message.id,
            thread_id: threadId,
            content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            createdAt: (message.createdAt || new Date()).toISOString(),
            role: message.role,
            type: message.type || 'v2',
            resourceId: message.resourceId || resourceId,
          })),
          clickhouse_settings: {
            date_time_input_format: 'best_effort',
            use_client_time_zone: 1,
            output_format_json_quote_64bit_integers: 0,
          },
        }) : Promise.resolve(),
        ...updatePromises,
        // Update thread's updatedAt timestamp
        this.client.insert({
          table: TABLE_THREADS,
          format: 'JSONEachRow',
          values: [
            {
              id: thread.id,
              resourceId: thread.resourceId,
              title: thread.title,
              metadata: JSON.stringify(thread.metadata),
              createdAt: thread.createdAt.toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          clickhouse_settings: {
            date_time_input_format: 'best_effort',
            use_client_time_zone: 1,
            output_format_json_quote_64bit_integers: 0,
          },
        }),
      ]);

      const list = new MessageList({ threadId, resourceId }).add(messages, 'memory');
      if (format === `v2`) return list.get.all.v2();
      return list.get.all.v1();
    } catch (error: any) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_SAVE_MESSAGES_FAILED',
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
      content?: {
        metadata?: MastraMessageContentV2['metadata'];
        content?: MastraMessageContentV2['content'];
      };
    })[];
  }): Promise<MastraMessageV2[]> {
    if (messages.length === 0) {
      return [];
    }

    const messageIds = messages.map(m => m.id);
    const placeholders = messageIds.map(() => 'String').join(',');

    const selectResult = await this.client.query({
      query: `SELECT id, content, role, type, toDateTime64(createdAt, 3) as createdAt, thread_id as "threadId", "resourceId" FROM ${TABLE_MESSAGES} WHERE id IN ({ids:Array(String)})`,
      query_params: { ids: messageIds },
      clickhouse_settings: {
        date_time_input_format: 'best_effort',
        date_time_output_format: 'iso',
        use_client_time_zone: 1,
        output_format_json_quote_64bit_integers: 0,
      },
    });
    
    const selectRows = await selectResult.json();
    const existingMessages: MastraMessageV2[] = selectRows.data.map((row: any) => {
      const transformed = transformRow(row);
      if (typeof transformed.content === 'string') {
        try {
          transformed.content = JSON.parse(transformed.content);
        } catch {
          // If parsing fails, leave as string
        }
      }
      return transformed;
    });

    if (existingMessages.length === 0) {
      return [];
    }

    const updatePromises = [];
    const threadIdsToUpdate = new Set<string>();

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
      const queryParams: Record<string, any> = { var_id: id, var_thread_id: existingMessage.threadId };
      const updatableFields = { ...fieldsToUpdate };

      // Special handling for content: merge and update
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
        setClauses.push(`content = {var_content:String}`);
        queryParams.var_content = JSON.stringify(newContent);
        delete updatableFields.content;
      }

      // Handle other fields
      let paramIndex = Object.keys(queryParams).length;
      for (const key in updatableFields) {
        if (Object.prototype.hasOwnProperty.call(updatableFields, key)) {
          const dbKey = key === 'threadId' ? 'thread_id' : key;
          setClauses.push(`"${dbKey}" = {var_${paramIndex}:String}`);
          queryParams[`var_${paramIndex}`] = updatableFields[key as keyof typeof updatableFields];
          paramIndex++;
        }
      }

      if (setClauses.length === 0) continue;

      const sql = `ALTER TABLE ${TABLE_MESSAGES} UPDATE ${setClauses.join(', ')} WHERE id = {var_id:String} AND thread_id = {var_thread_id:String}`;
      updatePromises.push(this.client.command({ query: sql, query_params: queryParams }));
    }

    if (updatePromises.length === 0) {
      return existingMessages;
    }

    // Update thread timestamps
    const now = new Date().toISOString();
    for (const threadId of threadIdsToUpdate) {
      if (threadId) {
        updatePromises.push(
          this.client.command({
            query: `ALTER TABLE ${TABLE_THREADS} UPDATE updatedAt = {var_now:String} WHERE id = {var_thread_id:String}`,
            query_params: { var_now: now, var_thread_id: threadId },
          }),
        );
      }
    }

    await Promise.all(updatePromises);

    // Re-fetch updated messages
    const updatedResult = await this.client.query({
      query: `SELECT id, content, role, type, toDateTime64(createdAt, 3) as createdAt, thread_id as "threadId", "resourceId" FROM ${TABLE_MESSAGES} WHERE id IN ({ids:Array(String)})`,
      query_params: { ids: messageIds },
      clickhouse_settings: {
        date_time_input_format: 'best_effort',
        date_time_output_format: 'iso',
        use_client_time_zone: 1,
        output_format_json_quote_64bit_integers: 0,
      },
    });
    
    const updatedRows = await updatedResult.json();
    return updatedRows.data.map((row: any) => {
      const transformed = transformRow(row);
      if (typeof transformed.content === 'string') {
        try {
          transformed.content = JSON.parse(transformed.content);
        } catch {
          // If parsing fails, leave as string
        }
      }
      return transformed;
    });
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

    const updates: string[] = [];
    const queryParams: Record<string, any> = {};

    if (workingMemory !== undefined) {
      updates.push('workingMemory = {var_workingMemory:String}');
      queryParams.var_workingMemory = workingMemory;
    }

    if (metadata) {
      updates.push('metadata = {var_metadata:String}');
      queryParams.var_metadata = JSON.stringify(updatedResource.metadata);
    }

    updates.push('updatedAt = {var_updatedAt:String}');
    queryParams.var_updatedAt = updatedResource.updatedAt.toISOString();
    queryParams.var_resourceId = resourceId;

    await this.client.command({
      query: `ALTER TABLE ${TABLE_RESOURCES} UPDATE ${updates.join(', ')} WHERE id = {var_resourceId:String}`,
      query_params: queryParams,
    });

    return updatedResource;
  }
}