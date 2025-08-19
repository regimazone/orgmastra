import type { Client, Row, InValue } from '@libsql/client';
import type { AISpanDatabaseRecord } from '@mastra/core/ai-tracing';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { ObservabilityStorage, safelyParseJSON, TABLE_AI_SPAN } from '@mastra/core/storage';
import type { StorageGetAiTracesPaginatedArg, PaginationInfo, AITrace } from '@mastra/core/storage';
import type { StoreOperationsLibSQL } from '../operations';

export class ObservabilityLibSQL extends ObservabilityStorage {
  private client: Client;
  private operations: StoreOperationsLibSQL;

  private transformRowToAISpan(row: Row): AISpanDatabaseRecord {
    const { scope, attributes, metadata, events, links, input, output, error, ...rest } = row;

    return {
      ...rest,
      scope: safelyParseJSON(scope),
      attributes: safelyParseJSON(attributes),
      metadata: safelyParseJSON(metadata),
      events: safelyParseJSON(events),
      links: safelyParseJSON(links),
      input: safelyParseJSON(input),
      output: safelyParseJSON(output),
      error: safelyParseJSON(error),
    } as any;
  }

  constructor({ client, operations }: { client: Client; operations: StoreOperationsLibSQL }) {
    super();
    this.client = client;
    this.operations = operations;
  }

  async createAiSpan(span: Omit<AISpanDatabaseRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    try {
      const id = `${span.traceId}-${span.spanId}`;
      await this.operations.insert({
        tableName: TABLE_AI_SPAN,
        record: { ...span, id },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORAGE_CREATE_AI_SPAN_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to create AI span: ${error}`,
      );
    }
  }

  async getAiSpan(id: string): Promise<AISpanDatabaseRecord | null> {
    try {
      const result = await this.client.execute({
        sql: `SELECT * FROM ${TABLE_AI_SPAN} WHERE id = ?`,
        args: [id],
      });
      return result.rows?.[0] ? this.transformRowToAISpan(result.rows[0]) : null;
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORAGE_GET_AI_SPAN_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to get AI span: ${error}`,
      );
    }
  }

  /**
   * Builds filter conditions for AI span queries.
   * Supported filters:
   * - name: string (LIKE search with % suffix)
   * - attributes: object (JSON field filtering)
   * - error: object (JSON field filtering)
   * - createdAt: Date (>= comparison) or string (exact match)
   * - traceId: string (exact match)
   * - spanType: number (exact match)
   */
  private buildFilterConditions(filters?: any): { conditions: string[]; args: InValue[] } {
    const conditions: string[] = [];
    const args: InValue[] = [];

    if (!filters) {
      return { conditions, args };
    }

    // Name filtering
    if (filters.name) {
      conditions.push('name = ?');
      args.push(filters.name);
    }

    // Attributes filtering (JSON field)
    if (filters.attributes && typeof filters.attributes === 'object') {
      Object.entries(filters.attributes).forEach(([key, value]) => {
        const jsonPath = `$.${key}`;
        if (value === null) {
          conditions.push(
            `(json_extract(attributes, '${jsonPath}') IS NULL OR json_type(attributes, '${jsonPath}') IS NULL)`,
          );
        } else if (
          value !== undefined &&
          (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        ) {
          conditions.push(`json_extract(attributes, '${jsonPath}') = ?`);
          args.push(value);
        }
      });
    }

    // Error filtering (JSON field)
    if (filters.error && typeof filters.error === 'object') {
      Object.entries(filters.error).forEach(([key, value]) => {
        const jsonPath = `$.${key}`;
        if (value === null) {
          conditions.push(`(json_extract(error, '${jsonPath}') IS NULL OR json_type(error, '${jsonPath}') IS NULL)`);
        } else if (
          value !== undefined &&
          (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        ) {
          conditions.push(`json_extract(error, '${jsonPath}') = ?`);
          args.push(value);
        }
      });
    }

    // CreatedAt filtering
    if (filters.createdAt !== undefined) {
      if (filters.createdAt instanceof Date) {
        conditions.push('createdAt >= ?');
        args.push(filters.createdAt.toISOString());
      } else {
        conditions.push('createdAt = ?');
        args.push(filters.createdAt);
      }
    }

    // TraceId filtering
    if (filters.traceId !== undefined) {
      conditions.push('traceId = ?');
      args.push(filters.traceId);
    }

    // SpanType filtering
    if (filters.spanType !== undefined) {
      conditions.push('spanType = ?');
      args.push(filters.spanType);
    }

    return { conditions, args };
  }

  async getAiTrace(traceId: string): Promise<AITrace | null> {
    try {
      const result = await this.client.execute({
        sql: `SELECT * FROM ${TABLE_AI_SPAN} WHERE traceId = ?`,
        args: [traceId],
      });

      if (result.rows.length === 0) {
        return null;
      }

      return {
        traceId,
        spans: result.rows.map(row => this.transformRowToAISpan(row)),
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORAGE_GET_AI_TRACE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to get AI trace: ${error}`,
      );
    }
  }

  async getAiTracesPaginated(
    args: StorageGetAiTracesPaginatedArg,
  ): Promise<PaginationInfo & { spans: AISpanDatabaseRecord[] }> {
    const { filters, page = 0, perPage = 10 } = args;
    const currentOffset = page * perPage;

    // Build filter conditions using extracted method
    const { conditions, args: parentQueryArgs } = this.buildFilterConditions(filters);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const countSql = `SELECT COUNT(*) as count FROM ${TABLE_AI_SPAN} WHERE parentSpanId IS NULL${whereClause ? ` AND ${conditions.join(' AND ')}` : ''}`;
      const countResult = await this.client.execute({
        sql: countSql,
        args: parentQueryArgs,
      });
      const total = (countResult.rows[0]?.count as number) || 0;

      const parentSql = `
        SELECT * FROM ${TABLE_AI_SPAN} 
        WHERE parentSpanId IS NULL${whereClause ? ` AND ${conditions.join(' AND ')}` : ''}
        ORDER BY createdAt DESC 
        LIMIT ? OFFSET ?
      `;
      const parentResult = await this.client.execute({
        sql: parentSql,
        args: [...parentQueryArgs, perPage, currentOffset],
      });

      const parentSpans = parentResult.rows.map(row => this.transformRowToAISpan(row));

      // Get all child spans for the found parent spans
      let allSpans = [...parentSpans];
      if (parentSpans.length > 0) {
        const traceIds = parentSpans.map(span => span.traceId);
        const childSql = `
          SELECT * FROM ${TABLE_AI_SPAN} 
          WHERE traceId IN (${traceIds.map(() => '?').join(',')}) 
          AND parentSpanId IS NOT NULL
        `;
        const childResult = await this.client.execute({
          sql: childSql,
          args: traceIds,
        });
        const childSpans = childResult.rows.map(row => this.transformRowToAISpan(row));
        allSpans = [...parentSpans, ...childSpans];
      }

      return {
        spans: allSpans,
        total,
        page,
        perPage,
        hasMore: total > currentOffset + perPage,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_GET_AI_SPANS_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to get AI spans paginated: ${error}`,
      );
    }
  }

  async updateAiSpan(id: string, updates: Partial<AISpanDatabaseRecord>): Promise<void> {
    // First check if the span exists
    const span = await this.getAiSpan(id);
    if (!span) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_UPDATE_AI_SPAN_NOT_FOUND',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
        },
        `AI span not found for update: ${id}`,
      );
    }

    // Use the batch update method for consistency
    return this.batchUpdateAiSpans([{ id, updates }]);
  }

  async deleteAiSpan(id: string): Promise<void> {
    try {
      await this.client.execute({
        sql: `DELETE FROM ${TABLE_AI_SPAN} WHERE id = ?`,
        args: [id],
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_DELETE_AI_SPAN_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to delete AI span: ${error}`,
      );
    }
  }

  async batchAiSpanCreate(args: {
    records: Omit<AISpanDatabaseRecord, 'id' | 'createdAt' | 'updatedAt'>[];
  }): Promise<void> {
    if (args.records.length === 0) {
      return; // No records to insert
    }

    try {
      const recordsWithIds = args.records.map(record => ({
        ...record,
        id: `${record.traceId}-${record.spanId}`,
      }));

      await this.operations.batchInsert({
        tableName: TABLE_AI_SPAN,
        records: recordsWithIds,
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_BATCH_AI_SPAN_CREATE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to batch create AI spans: ${error}`,
      );
    }
  }

  private async batchUpdateAiSpans(updates: { id: string; updates: Partial<AISpanDatabaseRecord> }[]): Promise<void> {
    if (updates.length === 0) {
      return; // No updates to make
    }

    try {
      const batchStatements = updates
        .map(({ id, updates: recordUpdates }) => {
          const { scope, attributes, metadata, events, links, input, output, error, ...rest } = recordUpdates;

          const fieldUpdates: string[] = [];
          const updateArgs: any[] = [];

          // Handle JSON fields
          if (scope !== undefined) {
            fieldUpdates.push('scope = ?');
            updateArgs.push(scope ? JSON.stringify(scope) : null);
          }
          if (attributes !== undefined) {
            fieldUpdates.push('attributes = ?');
            updateArgs.push(attributes ? JSON.stringify(attributes) : null);
          }
          if (metadata !== undefined) {
            fieldUpdates.push('metadata = ?');
            updateArgs.push(metadata ? JSON.stringify(metadata) : null);
          }
          if (events !== undefined) {
            fieldUpdates.push('events = ?');
            updateArgs.push(events ? JSON.stringify(events) : null);
          }
          if (links !== undefined) {
            fieldUpdates.push('links = ?');
            updateArgs.push(links ? JSON.stringify(links) : null);
          }
          if (input !== undefined) {
            fieldUpdates.push('input = ?');
            updateArgs.push(input ? JSON.stringify(input) : null);
          }
          if (output !== undefined) {
            fieldUpdates.push('output = ?');
            updateArgs.push(output ? JSON.stringify(output) : null);
          }
          if (error !== undefined) {
            fieldUpdates.push('error = ?');
            updateArgs.push(error ? JSON.stringify(error) : null);
          }

          // Handle non-JSON fields
          Object.entries(rest).forEach(([key, value]) => {
            if (value !== undefined) {
              fieldUpdates.push(`${key} = ?`);
              updateArgs.push(value);
            }
          });

          if (fieldUpdates.length === 0) {
            return null; // Skip records with no updates
          }

          return {
            sql: `UPDATE ${TABLE_AI_SPAN} SET ${fieldUpdates.join(', ')} WHERE id = ?`,
            args: [...updateArgs, id],
          };
        })
        .filter(Boolean); // Remove null statements

      if (batchStatements.length === 0) {
        return; // No valid updates to make
      }

      // Use LibSQL's native batch method
      const validStatements = batchStatements.filter((stmt): stmt is { sql: string; args: any[] } => stmt !== null);

      if (validStatements.length === 0) {
        return; // No valid updates to make
      }

      await this.client.batch(validStatements, 'write');
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_BATCH_AI_SPAN_UPDATE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to batch update AI spans: ${error}`,
      );
    }
  }

  async batchAiSpanUpdate(args: { records: { id: string; updates: Partial<AISpanDatabaseRecord> }[] }): Promise<void> {
    return this.batchUpdateAiSpans(args.records);
  }

  async batchAiSpanDelete(args: { ids: string[] }): Promise<void> {
    if (args.ids.length === 0) {
      return; // No IDs to delete
    }

    try {
      // Use a single SQL statement with IN clause for efficient batch deletion
      const placeholders = args.ids.map(() => '?').join(', ');
      await this.client.execute({
        sql: `DELETE FROM ${TABLE_AI_SPAN} WHERE id IN (${placeholders})`,
        args: args.ids,
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'LIBSQL_STORE_BATCH_AI_SPAN_DELETE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        `Failed to batch delete AI spans: ${error}`,
      );
    }
  }
}
