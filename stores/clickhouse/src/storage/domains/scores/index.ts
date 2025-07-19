import type { ClickHouseClient } from '@clickhouse/client';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import { ScoresStorage, TABLE_SCORERS } from '@mastra/core/storage';
import type { PaginationInfo, StoragePagination } from '@mastra/core/storage';
import type { StoreOperationsClickHouse } from '../operations';

export class ScoresClickHouse extends ScoresStorage {
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

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    try {
      const result = await this.operations.load<ScoreRowData>({
        tableName: TABLE_SCORERS,
        keys: { id },
      });

      if (!result) {
        return null;
      }

      return {
        ...result,
        metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata,
        score: typeof result.score === 'string' ? JSON.parse(result.score) : result.score,
        createdAt: new Date(result.createdAt),
        updatedAt: new Date(result.updatedAt),
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_SCORE_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { id },
        },
        error,
      );
    }
  }

  async saveScore(score: Omit<ScoreRowData, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ score: ScoreRowData }> {
    try {
      const now = new Date();
      const scoreWithId: ScoreRowData = {
        id: `score_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        ...score,
        metadata: JSON.stringify(score.metadata || {}),
        score: JSON.stringify(score.score),
        createdAt: now,
        updatedAt: now,
      };

      await this.operations.insert({
        tableName: TABLE_SCORERS,
        record: scoreWithId,
      });

      return {
        score: {
          ...scoreWithId,
          metadata: typeof scoreWithId.metadata === 'string' ? JSON.parse(scoreWithId.metadata) : scoreWithId.metadata,
          score: typeof scoreWithId.score === 'string' ? JSON.parse(scoreWithId.score) : scoreWithId.score,
        },
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_SAVE_SCORE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { scorerId: score.scorerId },
        },
        error,
      );
    }
  }

  async getScoresByRunId({
    runId,
    pagination,
  }: {
    runId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    const { page = 0, perPage = 50 } = pagination;
    const offset = page * perPage;

    try {
      // Get total count
      const countResult = await this.client.query({
        query: `SELECT COUNT(*) as count FROM ${TABLE_SCORERS} WHERE runId = {var_runId:String}`,
        query_params: { var_runId: runId },
      });

      const countRows = await countResult.json();
      const total = Number(countRows.data[0]?.count ?? 0);

      if (total === 0) {
        return {
          pagination: {
            total: 0,
            page,
            perPage,
            hasMore: false,
          },
          scores: [],
        };
      }

      // Get paginated data
      const result = await this.client.query({
        query: `
          SELECT *, toDateTime64(createdAt, 3) as createdAt, toDateTime64(updatedAt, 3) as updatedAt 
          FROM ${TABLE_SCORERS} 
          WHERE runId = {var_runId:String}
          ORDER BY createdAt DESC 
          LIMIT {var_limit:Int64} OFFSET {var_offset:Int64}
        `,
        query_params: {
          var_runId: runId,
          var_limit: perPage,
          var_offset: offset,
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      const scores = rows.data.map((row: any) => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        score: typeof row.score === 'string' ? JSON.parse(row.score) : row.score,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }));

      return {
        pagination: {
          total,
          page,
          perPage,
          hasMore: offset + scores.length < total,
        },
        scores,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_SCORES_BY_RUN_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { runId, page },
        },
        error,
      );
    }
  }

  async getScoresByEntityId({
    entityId,
    entityType,
    pagination,
  }: {
    pagination: StoragePagination;
    entityId: string;
    entityType: string;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    const { page = 0, perPage = 50 } = pagination;
    const offset = page * perPage;

    try {
      // Get total count
      const countResult = await this.client.query({
        query: `SELECT COUNT(*) as count FROM ${TABLE_SCORERS} WHERE entityId = {var_entityId:String} AND entityType = {var_entityType:String}`,
        query_params: { 
          var_entityId: entityId,
          var_entityType: entityType
        },
      });

      const countRows = await countResult.json();
      const total = Number(countRows.data[0]?.count ?? 0);

      if (total === 0) {
        return {
          pagination: {
            total: 0,
            page,
            perPage,
            hasMore: false,
          },
          scores: [],
        };
      }

      // Get paginated data
      const result = await this.client.query({
        query: `
          SELECT *, toDateTime64(createdAt, 3) as createdAt, toDateTime64(updatedAt, 3) as updatedAt 
          FROM ${TABLE_SCORERS} 
          WHERE entityId = {var_entityId:String} AND entityType = {var_entityType:String}
          ORDER BY createdAt DESC 
          LIMIT {var_limit:Int64} OFFSET {var_offset:Int64}
        `,
        query_params: {
          var_entityId: entityId,
          var_entityType: entityType,
          var_limit: perPage,
          var_offset: offset,
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      const scores = rows.data.map((row: any) => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        score: typeof row.score === 'string' ? JSON.parse(row.score) : row.score,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }));

      return {
        pagination: {
          total,
          page,
          perPage,
          hasMore: offset + scores.length < total,
        },
        scores,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_SCORES_BY_ENTITY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { entityId, entityType, page },
        },
        error,
      );
    }
  }

  async getScoresByScorerId({
    scorerId,
    entityId,
    entityType,
    pagination,
  }: {
    scorerId: string;
    entityId?: string;
    entityType?: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    const { page = 0, perPage = 50 } = pagination;
    const offset = page * perPage;

    try {
      const conditions = [`scorerId = {var_scorerId:String}`];
      const queryParams: Record<string, any> = { var_scorerId: scorerId };

      if (entityId) {
        conditions.push(`entityId = {var_entityId:String}`);
        queryParams.var_entityId = entityId;
      }

      if (entityType) {
        conditions.push(`entityType = {var_entityType:String}`);
        queryParams.var_entityType = entityType;
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get total count
      const countResult = await this.client.query({
        query: `SELECT COUNT(*) as count FROM ${TABLE_SCORERS} ${whereClause}`,
        query_params: queryParams,
      });

      const countRows = await countResult.json();
      const total = Number(countRows.data[0]?.count ?? 0);

      if (total === 0) {
        return {
          pagination: {
            total: 0,
            page,
            perPage,
            hasMore: false,
          },
          scores: [],
        };
      }

      // Get paginated data
      const result = await this.client.query({
        query: `
          SELECT *, toDateTime64(createdAt, 3) as createdAt, toDateTime64(updatedAt, 3) as updatedAt 
          FROM ${TABLE_SCORERS} 
          ${whereClause}
          ORDER BY createdAt DESC 
          LIMIT {var_limit:Int64} OFFSET {var_offset:Int64}
        `,
        query_params: {
          ...queryParams,
          var_limit: perPage,
          var_offset: offset,
        },
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      const rows = await result.json();
      const scores = rows.data.map((row: any) => ({
        ...row,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        score: typeof row.score === 'string' ? JSON.parse(row.score) : row.score,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }));

      return {
        pagination: {
          total,
          page,
          perPage,
          hasMore: offset + scores.length < total,
        },
        scores,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_GET_SCORES_BY_SCORER_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { scorerId, entityId, entityType, page },
        },
        error,
      );
    }
  }
}