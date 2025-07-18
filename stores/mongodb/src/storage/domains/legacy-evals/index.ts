import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import type { MetricResult, TestInfo } from '@mastra/core/eval';
import { LegacyEvalsStorage, TABLE_EVALS } from '@mastra/core/storage';
import type { EvalRow, PaginationArgs, PaginationInfo } from '@mastra/core/storage';
import type { Db, MongoClientOptions } from 'mongodb';
import { MongoClient } from 'mongodb';
import type { StoreOperationsMongoDB } from '../operations';
import { safelyParseJSON, formatDateForMongoDB } from '../utils';

export interface MongoDBLegacyEvalsConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class LegacyEvalsMongoDB extends LegacyEvalsStorage {
  #isConnected = false;
  #client: MongoClient;
  #db: Db | undefined;
  readonly #dbName: string;
  private operations: StoreOperationsMongoDB;

  constructor({ url, dbName, options, operations }: MongoDBLegacyEvalsConfig & { operations: StoreOperationsMongoDB }) {
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

  private transformEvalRow(row: Record<string, any>): EvalRow {
    let testInfoValue = null;
    if (row.test_info) {
      try {
        testInfoValue = typeof row.test_info === 'string' ? safelyParseJSON(row.test_info) : row.test_info;
      } catch (e) {
        console.warn('Failed to parse test_info:', e);
      }
    }
    
    const resultValue = typeof row.result === 'string' ? safelyParseJSON(row.result) : row.result;
    if (!resultValue || typeof resultValue !== 'object' || !('score' in resultValue)) {
      throw new MastraError({
        id: 'MONGODB_STORE_INVALID_METRIC_FORMAT',
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

  async getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    try {
      const collection = await this.getCollection(TABLE_EVALS);
      const query: any = { agent_name: agentName };

      if (type === 'test') {
        query.test_info = { $ne: null };
      }

      if (type === 'live') {
        query.test_info = null;
      }

      const documents = await collection.find(query).sort({ created_at: -1 }).toArray();
      const result = documents.map(row => this.transformEvalRow(row));
      
      // Post filter to remove if test_info.testPath is null for more precise filtering
      return result.filter(row => {
        if (type === 'live') {
          return !Boolean(row.testInfo?.testPath);
        }

        if (type === 'test') {
          return row.testInfo?.testPath !== null;
        }
        return true;
      });
    } catch (error) {
      // Handle case where collection doesn't exist yet
      if (error instanceof Error && error.message.includes('ns not found')) {
        return [];
      }
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_EVALS_BY_AGENT_NAME_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName },
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
    try {
      const { agentName, type, page = 0, perPage = 100 } = options;
      const collection = await this.getCollection(TABLE_EVALS);
      const query: any = {};

      if (agentName) {
        query.agent_name = agentName;
      }

      if (type === 'test') {
        query.test_info = { $ne: null };
      }

      if (type === 'live') {
        query.test_info = null;
      }

      const total = await collection.countDocuments(query);

      if (total === 0) {
        return {
          evals: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      const currentOffset = page * perPage;
      const documents = await collection
        .find(query)
        .sort({ created_at: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      let evals = documents.map(row => this.transformEvalRow(row));

      // Post filter for more precise filtering
      evals = evals.filter(row => {
        if (type === 'live') {
          return !Boolean(row.testInfo?.testPath);
        }

        if (type === 'test') {
          return row.testInfo?.testPath !== null;
        }
        return true;
      });

      return {
        evals,
        total,
        page,
        perPage,
        hasMore: currentOffset + evals.length < total,
      };
    } catch (error) {
      // Handle case where collection doesn't exist yet
      if (error instanceof Error && error.message.includes('ns not found')) {
        return {
          evals: [],
          total: 0,
          page: options.page || 0,
          perPage: options.perPage || 100,
          hasMore: false,
        };
      }
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_EVALS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { agentName: options.agentName },
        },
        error,
      );
    }
  }

  async saveEval(evalData: EvalRow): Promise<void> {
    try {
      // Convert EvalRow back to the database format
      const record = {
        input: evalData.input,
        output: evalData.output,
        result: typeof evalData.result === 'object' ? JSON.stringify(evalData.result) : evalData.result,
        agent_name: evalData.agentName,
        metric_name: evalData.metricName,
        instructions: evalData.instructions,
        test_info: evalData.testInfo ? JSON.stringify(evalData.testInfo) : null,
        global_run_id: evalData.globalRunId,
        run_id: evalData.runId,
        created_at: evalData.createdAt,
      };

      await this.operations.insert({
        tableName: TABLE_EVALS,
        record,
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_SAVE_EVAL_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { 
            agentName: evalData.agentName,
            runId: evalData.runId,
          },
        },
        error,
      );
    }
  }
}