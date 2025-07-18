import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { ScoreRowData } from '@mastra/core/eval';
import { ScoresStorage, TABLE_SCORES } from '@mastra/core/storage';
import type { PaginationInfo, StoragePagination } from '@mastra/core/storage';
import type { Db, MongoClientOptions } from 'mongodb';
import { MongoClient } from 'mongodb';
import type { StoreOperationsMongoDB } from '../operations';
import { formatDateForMongoDB } from '../utils';

export interface MongoDBScoresConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class ScoresMongoDB extends ScoresStorage {
  #isConnected = false;
  #client: MongoClient;
  #db: Db | undefined;
  readonly #dbName: string;
  private operations: StoreOperationsMongoDB;

  constructor({ url, dbName, options, operations }: MongoDBScoresConfig & { operations: StoreOperationsMongoDB }) {
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

  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    try {
      const result = await this.operations.load<ScoreRowData>({
        tableName: TABLE_SCORES,
        keys: { id },
      });

      if (!result) {
        return null;
      }

      return {
        ...result,
        createdAt: formatDateForMongoDB(result.createdAt),
        updatedAt: formatDateForMongoDB(result.updatedAt),
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_SCORE_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { id },
        },
        error,
      );
    }
  }

  async saveScore(score: ScoreRowData): Promise<{ score: ScoreRowData }> {
    try {
      await this.operations.insert({
        tableName: TABLE_SCORES,
        record: score,
      });

      return { score };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_SAVE_SCORE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { scoreId: score.id },
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
      const { page = 0, perPage = 100 } = pagination;
      const collection = await this.getCollection(TABLE_SCORES);
      
      const query = { runId };
      const total = await collection.countDocuments(query);

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

      const currentOffset = page * perPage;
      const results = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      const scores = results.map(score => ({
        ...score,
        createdAt: formatDateForMongoDB(score.createdAt),
        updatedAt: formatDateForMongoDB(score.updatedAt),
      })) as ScoreRowData[];

      return {
        pagination: {
          total,
          page,
          perPage,
          hasMore: currentOffset + scores.length < total,
        },
        scores,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_SCORES_BY_RUN_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
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
    entityId: string;
    entityType: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    try {
      const { page = 0, perPage = 100 } = pagination;
      const collection = await this.getCollection(TABLE_SCORES);
      
      const query = { entityId, entityType };
      const total = await collection.countDocuments(query);

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

      const currentOffset = page * perPage;
      const results = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      const scores = results.map(score => ({
        ...score,
        createdAt: formatDateForMongoDB(score.createdAt),
        updatedAt: formatDateForMongoDB(score.updatedAt),
      })) as ScoreRowData[];

      return {
        pagination: {
          total,
          page,
          perPage,
          hasMore: currentOffset + scores.length < total,
        },
        scores,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_SCORES_BY_ENTITY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { entityId, entityType },
        },
        error,
      );
    }
  }

  async getScoresByScorerId({
    scorerId,
    pagination,
  }: {
    scorerId: string;
    pagination: StoragePagination;
  }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
    try {
      const { page = 0, perPage = 100 } = pagination;
      const collection = await this.getCollection(TABLE_SCORES);
      
      const query = { scorerId };
      const total = await collection.countDocuments(query);

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

      const currentOffset = page * perPage;
      const results = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      const scores = results.map(score => ({
        ...score,
        createdAt: formatDateForMongoDB(score.createdAt),
        updatedAt: formatDateForMongoDB(score.updatedAt),
      })) as ScoreRowData[];

      return {
        pagination: {
          total,
          page,
          perPage,
          hasMore: currentOffset + scores.length < total,
        },
        scores,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_SCORES_BY_SCORER_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { scorerId },
        },
        error,
      );
    }
  }
}