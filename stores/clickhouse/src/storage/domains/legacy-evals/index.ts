import type { ClickHouseClient } from '@clickhouse/client';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { MetricResult, TestInfo } from '@mastra/core/eval';
import { LegacyEvalsStorage, TABLE_EVALS } from '@mastra/core/storage';
import type { EvalRow, PaginationArgs, PaginationInfo } from '@mastra/core/storage';

export class LegacyEvalsClickHouse extends LegacyEvalsStorage {
  private client: ClickHouseClient;

  constructor({ client }: { client: ClickHouseClient }) {
    super();
    this.client = client;
  }

  private transformEvalRow(row: Record<string, any>): EvalRow {
    // Transform date if needed
    if (row.createdAt) {
      row.createdAt = new Date(row.createdAt);
    }
    if (row.updatedAt) {
      row.updatedAt = new Date(row.updatedAt);
    }

    const resultValue = JSON.parse(row.result as string);
    const testInfoValue = row.test_info ? JSON.parse(row.test_info as string) : undefined;

    if (!resultValue || typeof resultValue !== 'object' || !('score' in resultValue)) {
      throw new MastraError({
        id: 'CLICKHOUSE_STORAGE_INVALID_METRIC_FORMAT',
        text: `Invalid MetricResult format: ${JSON.stringify(resultValue)}`,
        domain: ErrorDomain.STORAGE,
        category: ErrorCategory.USER,
      });
    }

    return {
      input: row.input as string,
      output: row.output as string,
      result: resultValue as MetricResult,
      agentName: row.agent_name as string,
      metricName: row.metric_name as string,
      instructions: row.instructions as string,
      testInfo: testInfoValue as TestInfo,
      globalRunId: row.global_run_id as string,
      runId: row.run_id as string,
      createdAt: row.created_at as string,
    };
  }

  /** @deprecated use getEvals instead */
  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    try {
      const baseQuery = `SELECT *, toDateTime64(createdAt, 3) as createdAt FROM ${TABLE_EVALS} WHERE agent_name = {var_agent_name:String}`;
      const typeCondition =
        type === 'test'
          ? " AND test_info IS NOT NULL AND JSONExtractString(test_info, 'testPath') IS NOT NULL"
          : type === 'live'
            ? " AND (test_info IS NULL OR JSONExtractString(test_info, 'testPath') IS NULL)"
            : '';

      const result = await this.client.query({
        query: `${baseQuery}${typeCondition} ORDER BY createdAt DESC`,
        query_params: { var_agent_name: agentName },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      if (!result) {
        return [];
      }

      const rows = await result.json();
      return rows.data.map((row: any) => this.transformEvalRow(row));
    } catch (error: any) {
      if (error?.message?.includes('no such table') || error?.message?.includes('does not exist')) {
        return [];
      }
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_EVALS_BY_AGENT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName, type: type ?? null },
        },
        error,
      );
    }
  }

  async getEvals(
    options: {
      agentName?: string;
      type?: 'test' | 'live';
    } & PaginationArgs = {},
  ): Promise<PaginationInfo & { evals: EvalRow[] }> {
    const { agentName, type, page = 0, perPage = 50 } = options;
    const offset = page * perPage;

    try {
      const conditions: string[] = [];
      const queryParams: Record<string, any> = {};

      if (agentName) {
        conditions.push('agent_name = {var_agent_name:String}');
        queryParams.var_agent_name = agentName;
      }

      if (type === 'test') {
        conditions.push("test_info IS NOT NULL AND JSONExtractString(test_info, 'testPath') IS NOT NULL");
      } else if (type === 'live') {
        conditions.push("(test_info IS NULL OR JSONExtractString(test_info, 'testPath') IS NULL)");
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await this.client.query({
        query: `SELECT COUNT(*) as count FROM ${TABLE_EVALS} ${whereClause}`,
        query_params: queryParams,
      });

      const countRows = await countResult.json();
      const total = Number(countRows.data[0]?.count ?? 0);

      if (total === 0) {
        return {
          evals: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      // Get paginated data
      const result = await this.client.query({
        query: `SELECT *, toDateTime64(createdAt, 3) as createdAt FROM ${TABLE_EVALS} ${whereClause} ORDER BY createdAt DESC LIMIT ${perPage} OFFSET ${offset}`,
        query_params: queryParams,
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      if (!result) {
        return {
          evals: [],
          total,
          page,
          perPage,
          hasMore: false,
        };
      }

      const rows = await result.json();
      const evals = rows.data.map((row: any) => this.transformEvalRow(row));

      return {
        evals,
        total,
        page,
        perPage,
        hasMore: offset + evals.length < total,
      };
    } catch (error: any) {
      if (error?.message?.includes('no such table') || error?.message?.includes('does not exist')) {
        return {
          evals: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_EVALS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName: agentName ?? null, type: type ?? null, page },
        },
        error,
      );
    }
  }
}