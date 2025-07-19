import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import { ScoresStorage, TABLE_SCORES } from '@mastra/core/storage';
import type { PaginationInfo, StoragePagination } from '@mastra/core/storage';
import { createSqlBuilder } from '../../sql-builder';
import type { StoreOperationsD1 } from '../operations';

export class ScoresD1 extends ScoresStorage {
  private operations: StoreOperationsD1;

  constructor({ operations }: { operations: StoreOperationsD1 }) {
    super();
    this.operations = operations;
  }

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    try {
      const result = await this.operations.load<ScoreRowData>({
        tableName: TABLE_SCORES,
        keys: { id },
      });

      if (!result) return null;

      return {
        ...result,
        createdAt: new Date(result.createdAt),
        updatedAt: new Date(result.updatedAt),
        metadata: typeof result.metadata === 'string' ? JSON.parse(result.metadata) : result.metadata,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_SCORE_BY_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get score by id ${id}: ${error instanceof Error ? error.message : String(error)}`,
          details: { id },
        },
        error,
      );
    }
  }

  async saveScore(score: Omit<ScoreRowData, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ score: ScoreRowData }> {
    try {
      const now = new Date();
      const id = crypto.randomUUID();
      
      const scoreToSave: ScoreRowData = {
        ...score,
        id,
        createdAt: now,
        updatedAt: now,
      };

      await this.operations.insert({
        tableName: TABLE_SCORES,
        record: {
          ...scoreToSave,
          metadata: JSON.stringify(scoreToSave.metadata || {}),
        },
      });

      return { score: scoreToSave };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_SAVE_SCORE_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to save score: ${error instanceof Error ? error.message : String(error)}`,
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
    try {
      const { page, perPage } = pagination;
      const offset = page * perPage;

      const countQuery = createSqlBuilder().count().from(TABLE_SCORES).where('scorerId = ?', scorerId);
      const dataQuery = createSqlBuilder().select('*').from(TABLE_SCORES).where('scorerId = ?', scorerId);

      if (entityId) {
        countQuery.andWhere('entityId = ?', entityId);
        dataQuery.andWhere('entityId = ?', entityId);
      }

      if (entityType) {
        countQuery.andWhere('entityType = ?', entityType);
        dataQuery.andWhere('entityType = ?', entityType);
      }

      dataQuery.orderBy('createdAt', 'DESC').limit(perPage).offset(offset);

      const countResult = (await this.operations.executeQuery(countQuery.build())) as { count: number }[];
      const total = Number(countResult[0]?.count ?? 0);

      const results = (await this.operations.executeQuery(dataQuery.build())) as any[];
      const scores = results.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
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
          id: 'CLOUDFLARE_D1_STORAGE_GET_SCORES_BY_SCORER_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get scores by scorer id: ${error instanceof Error ? error.message : String(error)}`,
          details: { scorerId },
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
    try {
      const { page, perPage } = pagination;
      const offset = page * perPage;

      const countQuery = createSqlBuilder().count().from(TABLE_SCORES).where('runId = ?', runId);
      const dataQuery = createSqlBuilder()
        .select('*')
        .from(TABLE_SCORES)
        .where('runId = ?', runId)
        .orderBy('createdAt', 'DESC')
        .limit(perPage)
        .offset(offset);

      const countResult = (await this.operations.executeQuery(countQuery.build())) as { count: number }[];
      const total = Number(countResult[0]?.count ?? 0);

      const results = (await this.operations.executeQuery(dataQuery.build())) as any[];
      const scores = results.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
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
          id: 'CLOUDFLARE_D1_STORAGE_GET_SCORES_BY_RUN_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get scores by run id: ${error instanceof Error ? error.message : String(error)}`,
          details: { runId },
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
    try {
      const { page, perPage } = pagination;
      const offset = page * perPage;

      const countQuery = createSqlBuilder()
        .count()
        .from(TABLE_SCORES)
        .where('entityId = ?', entityId)
        .andWhere('entityType = ?', entityType);

      const dataQuery = createSqlBuilder()
        .select('*')
        .from(TABLE_SCORES)
        .where('entityId = ?', entityId)
        .andWhere('entityType = ?', entityType)
        .orderBy('createdAt', 'DESC')
        .limit(perPage)
        .offset(offset);

      const countResult = (await this.operations.executeQuery(countQuery.build())) as { count: number }[];
      const total = Number(countResult[0]?.count ?? 0);

      const results = (await this.operations.executeQuery(dataQuery.build())) as any[];
      const scores = results.map(row => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
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
          id: 'CLOUDFLARE_D1_STORAGE_GET_SCORES_BY_ENTITY_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get scores by entity id: ${error instanceof Error ? error.message : String(error)}`,
          details: { entityId, entityType },
        },
        error,
      );
    }
  }
}