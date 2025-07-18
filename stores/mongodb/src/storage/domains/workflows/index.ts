import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { WorkflowsStorage, TABLE_WORKFLOW_SNAPSHOT } from '@mastra/core/storage';
import type { WorkflowRun, WorkflowRuns } from '@mastra/core/storage';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { Db, MongoClientOptions } from 'mongodb';
import { MongoClient } from 'mongodb';
import type { StoreOperationsMongoDB } from '../operations';
import { safelyParseJSON, formatDateForMongoDB } from '../utils';

export interface MongoDBWorkflowsConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class WorkflowsMongoDB extends WorkflowsStorage {
  #isConnected = false;
  #client: MongoClient;
  #db: Db | undefined;
  readonly #dbName: string;
  private operations: StoreOperationsMongoDB;

  constructor({ url, dbName, options, operations }: MongoDBWorkflowsConfig & { operations: StoreOperationsMongoDB }) {
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

  private parseWorkflowRun(row: any): WorkflowRun {
    let parsedSnapshot: WorkflowRunState | string = row.snapshot;
    if (typeof parsedSnapshot === 'string') {
      try {
        parsedSnapshot = safelyParseJSON(row.snapshot);
      } catch (e) {
        // If parsing fails, return the raw snapshot string
        console.warn(`Failed to parse snapshot for workflow ${row.workflow_name}: ${e}`);
      }
    }

    return {
      workflowName: row.workflow_name,
      runId: row.run_id,
      snapshot: parsedSnapshot,
      createdAt: formatDateForMongoDB(row.createdAt),
      updatedAt: formatDateForMongoDB(row.updatedAt),
      resourceId: row.resourceId,
    };
  }

  async getWorkflowRuns({
    workflowName,
    fromDate,
    toDate,
    limit,
    offset,
  }: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<WorkflowRuns> {
    try {
      const collection = await this.getCollection(TABLE_WORKFLOW_SNAPSHOT);
      const query: any = {};

      if (workflowName) {
        query.workflow_name = workflowName;
      }

      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) {
          query.createdAt.$gte = fromDate;
        }
        if (toDate) {
          query.createdAt.$lte = toDate;
        }
      }

      let total = 0;
      // Only get total count when using pagination
      if (limit !== undefined && offset !== undefined) {
        total = await collection.countDocuments(query);
      }

      // Get results
      const request = collection.find(query).sort({ createdAt: -1 });
      if (limit) {
        request.limit(limit);
      }

      if (offset) {
        request.skip(offset);
      }

      const results = await request.toArray();
      const runs = results.map(row => this.parseWorkflowRun(row));

      // Use runs.length as total when not paginating
      return { runs, total: total || runs.length };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_WORKFLOW_RUNS_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async persistWorkflowSnapshot({
    workflowName,
    runId,
    snapshot,
  }: {
    workflowName: string;
    runId: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    try {
      const collection = await this.getCollection(TABLE_WORKFLOW_SNAPSHOT);
      const now = new Date();
      
      await collection.updateOne(
        { workflow_name: workflowName, run_id: runId },
        {
          $set: {
            snapshot: snapshot,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true }
      );
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_PERSIST_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }

  async loadWorkflowSnapshot({
    workflowName,
    runId,
  }: {
    workflowName: string;
    runId: string;
  }): Promise<WorkflowRunState | null> {
    try {
      const result = await this.operations.load<any>({
        tableName: TABLE_WORKFLOW_SNAPSHOT,
        keys: {
          workflow_name: workflowName,
          run_id: runId,
        },
      });

      if (!result) {
        return null;
      }

      return typeof result.snapshot === 'string' ? safelyParseJSON(result.snapshot) : result.snapshot;
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_LOAD_WORKFLOW_SNAPSHOT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    try {
      const collection = await this.getCollection(TABLE_WORKFLOW_SNAPSHOT);
      const query: any = { run_id: runId };

      if (workflowName) {
        query.workflow_name = workflowName;
      }

      const result = await collection.findOne(query);
      if (!result) {
        return null;
      }

      return this.parseWorkflowRun(result);
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_WORKFLOW_RUN_BY_ID_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { runId },
        },
        error,
      );
    }
  }
}