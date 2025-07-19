import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { TABLE_TRACES, TracesStorage } from '@mastra/core/storage';
import type { PaginationInfo, StorageGetTracesArg } from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import { createSqlBuilder } from '../../sql-builder';
import type { StoreOperationsD1 } from '../operations';

export class TracesD1 extends TracesStorage {
  private operations: StoreOperationsD1;

  constructor({ operations }: { operations: StoreOperationsD1 }) {
    super();
    this.operations = operations;
  }

  private deserializeValue(value: any, type?: string): any {
    if (value === null || value === undefined) return null;

    if (type === 'jsonb' && typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, any>;
      } catch {
        return value;
      }
    }

    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        return JSON.parse(value) as Record<string, any>;
      } catch {
        return value;
      }
    }

    return value;
  }

  async getTraces({
    name,
    scope,
    page,
    perPage,
    attributes,
    fromDate,
    toDate,
  }: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<Trace[]> {
    try {
      const query = createSqlBuilder().select('*').from(TABLE_TRACES).where('1=1');

      if (name) {
        query.andWhere('name LIKE ?', `%${name}%`);
      }

      if (scope) {
        query.andWhere('scope = ?', scope);
      }

      if (attributes && Object.keys(attributes).length > 0) {
        for (const [key, value] of Object.entries(attributes)) {
          query.jsonLike('attributes', key, value);
        }
      }

      if (fromDate) {
        query.andWhere('createdAt >= ?', fromDate instanceof Date ? fromDate.toISOString() : fromDate);
      }

      if (toDate) {
        query.andWhere('createdAt <= ?', toDate instanceof Date ? toDate.toISOString() : toDate);
      }

      query
        .orderBy('startTime', 'DESC')
        .limit(perPage)
        .offset(page * perPage);

      const { sql, params } = query.build();
      const results = await this.operations.executeQuery({ sql, params });

      return Array.isArray(results)
        ? results.map(
            (trace: Record<string, any>) =>
              ({
                ...trace,
                attributes: this.deserializeValue(trace.attributes, 'jsonb'),
                status: this.deserializeValue(trace.status, 'jsonb'),
                events: this.deserializeValue(trace.events, 'jsonb'),
                links: this.deserializeValue(trace.links, 'jsonb'),
                other: this.deserializeValue(trace.other, 'jsonb'),
              }) as Trace,
          )
        : [];
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_TRACES_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to retrieve traces: ${error instanceof Error ? error.message : String(error)}`,
          details: {
            name: name ?? '',
            scope: scope ?? '',
          },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return [];
    }
  }

  async getTracesPaginated(args: {
    name?: string;
    scope?: string;
    attributes?: Record<string, string>;
    page: number;
    perPage: number;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<PaginationInfo & { traces: Trace[] }> {
    const { name, scope, page, perPage, attributes, fromDate, toDate } = args;

    try {
      const dataQuery = createSqlBuilder().select('*').from(TABLE_TRACES).where('1=1');
      const countQuery = createSqlBuilder().count().from(TABLE_TRACES).where('1=1');

      if (name) {
        dataQuery.andWhere('name LIKE ?', `%${name}%`);
        countQuery.andWhere('name LIKE ?', `%${name}%`);
      }

      if (scope) {
        dataQuery.andWhere('scope = ?', scope);
        countQuery.andWhere('scope = ?', scope);
      }

      if (attributes && Object.keys(attributes).length > 0) {
        for (const [key, value] of Object.entries(attributes)) {
          dataQuery.jsonLike('attributes', key, value);
          countQuery.jsonLike('attributes', key, value);
        }
      }

      if (fromDate) {
        const fromDateStr = fromDate instanceof Date ? fromDate.toISOString() : fromDate;
        dataQuery.andWhere('createdAt >= ?', fromDateStr);
        countQuery.andWhere('createdAt >= ?', fromDateStr);
      }

      if (toDate) {
        const toDateStr = toDate instanceof Date ? toDate.toISOString() : toDate;
        dataQuery.andWhere('createdAt <= ?', toDateStr);
        countQuery.andWhere('createdAt <= ?', toDateStr);
      }

      const countResult = (await this.operations.executeQuery(countQuery.build())) as {
        count: number;
      }[];
      const total = Number(countResult?.[0]?.count ?? 0);

      dataQuery
        .orderBy('startTime', 'DESC')
        .limit(perPage)
        .offset(page * perPage);

      const results = (await this.operations.executeQuery(dataQuery.build())) as any[];
      const traces = results.map(
        (trace: Record<string, any>) =>
          ({
            ...trace,
            attributes: this.deserializeValue(trace.attributes, 'jsonb'),
            status: this.deserializeValue(trace.status, 'jsonb'),
            events: this.deserializeValue(trace.events, 'jsonb'),
            links: this.deserializeValue(trace.links, 'jsonb'),
            other: this.deserializeValue(trace.other, 'jsonb'),
          }) as Trace,
      );

      return {
        traces,
        total,
        page,
        perPage,
        hasMore: page * perPage + traces.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_TRACES_PAGINATED_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to retrieve traces: ${error instanceof Error ? error.message : String(error)}`,
          details: {
            name: name ?? '',
            scope: scope ?? '',
          },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return {
        traces: [],
        total: 0,
        page,
        perPage,
        hasMore: false,
      };
    }
  }

  async batchTraceInsert(args: { records: Record<string, any>[] }): Promise<void> {
    try {
      await this.operations.batchInsert({
        tableName: TABLE_TRACES,
        records: args.records,
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_BATCH_TRACE_INSERT_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to batch insert traces: ${error instanceof Error ? error.message : String(error)}`,
        },
        error,
      );
    }
  }
}