import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { LegacyEvalsStorage, TABLE_EVALS } from '@mastra/core/storage';
import type { EvalRow, PaginationArgs, PaginationInfo } from '@mastra/core/storage';
import { createSqlBuilder } from '../../sql-builder';
import type { StoreOperationsD1 } from '../operations';

export class LegacyEvalsD1 extends LegacyEvalsStorage {
  private operations: StoreOperationsD1;

  constructor({ operations }: { operations: StoreOperationsD1 }) {
    super();
    this.operations = operations;
  }

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    try {
      const query = createSqlBuilder().select('*').from(TABLE_EVALS).where('agentName = ?', agentName);

      if (type) {
        query.andWhere('type = ?', type);
      }

      query.orderBy('createdAt', 'DESC');

      const { sql, params } = query.build();
      const results = await this.operations.executeQuery({ sql, params });

      return Array.isArray(results)
        ? results.map((row: any) => ({
            ...row,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
            testInfo: typeof row.testInfo === 'string' ? JSON.parse(row.testInfo) : row.testInfo,
            result: typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
          }))
        : [];
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_EVALS_BY_AGENT_NAME_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get evals by agent name: ${error instanceof Error ? error.message : String(error)}`,
          details: { agentName, type },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return [];
    }
  }

  async getEvals(
    options: {
      agentName?: string;
      type?: 'test' | 'live';
    } & PaginationArgs = {},
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    try {
      const { agentName, type, page = 0, perPage = 50 } = options;
      const offset = page * perPage;

      const countQuery = createSqlBuilder().count().from(TABLE_EVALS);
      const dataQuery = createSqlBuilder().select('*').from(TABLE_EVALS);

      const conditions: string[] = [];
      const params: any[] = [];

      if (agentName) {
        conditions.push('agentName = ?');
        params.push(agentName);
      }

      if (type) {
        conditions.push('type = ?');
        params.push(type);
      }

      if (conditions.length > 0) {
        const whereClause = conditions.join(' AND ');
        countQuery.where(whereClause, ...params);
        dataQuery.where(whereClause, ...params);
      } else {
        countQuery.where('1=1');
        dataQuery.where('1=1');
      }

      dataQuery.orderBy('createdAt', 'DESC').limit(perPage).offset(offset);

      const countResult = (await this.operations.executeQuery(countQuery.build())) as { count: number }[];
      const total = Number(countResult[0]?.count ?? 0);

      const results = (await this.operations.executeQuery(dataQuery.build())) as any[];
      const evals = results.map((row: any) => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        testInfo: typeof row.testInfo === 'string' ? JSON.parse(row.testInfo) : row.testInfo,
        result: typeof row.result === 'string' ? JSON.parse(row.result) : row.result,
      }));

      return {
        evals,
        total,
        page,
        perPage,
        hasMore: offset + evals.length < total,
      };
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_EVALS_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get evals: ${error instanceof Error ? error.message : String(error)}`,
          details: { ...options },
        },
        error,
      );
      this.logger?.error(mastraError.toString());
      this.logger?.trackException(mastraError);
      return {
        evals: [],
        total: 0,
        page: options.page ?? 0,
        perPage: options.perPage ?? 50,
        hasMore: false,
      };
    }
  }
}