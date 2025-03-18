import { connect, Index } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions, CreateTableOptions, Table, TableLike } from '@lancedb/lancedb';

import type {
  CreateIndexArgs,
  CreateIndexParams,
  IndexStats,
  ParamsToArgs,
  QueryResult,
  QueryVectorArgs,
  QueryVectorParams,
  UpsertVectorArgs,
  UpsertVectorParams,
} from '@mastra/core';

import { MastraVector } from '@mastra/core';
import type { IndexConfig } from './types';
import { count } from 'console';

interface LanceCreateIndexParams extends CreateIndexParams {
  indexConfig?: LanceIndexConfig;
  tableName?: string;
}

interface LanceIndexConfig extends IndexConfig {
  numPartitions?: number;
  numSubVectors?: number;
}

type LanceCreateIndexArgs = [...CreateIndexArgs, LanceIndexConfig?, boolean?];

export class LanceVectorStore extends MastraVector {
  private lanceClient!: Connection;

  /**
   * Creates a new instance of LanceVectorStore
   * @param uri The URI to connect to LanceDB
   * @param options connection options
   *
   * Usage:
   *
   * Connect to a local database
   * ```ts
   * const store = await LanceVectorStore.create('/path/to/db');
   * ```
   *
   * Connect to a LanceDB cloud database
   * ```ts
   * const store = await LanceVectorStore.create('db://host:port');
   * ```
   *
   * Connect to a cloud database
   * ```ts
   * const store = await LanceVectorStore.create('s3://bucket/db', { storageOptions: { timeout: '60s' } });
   * ```
   */
  public static async create(uri: string, options?: ConnectionOptions): Promise<LanceVectorStore> {
    const instance = new LanceVectorStore();
    try {
      instance.lanceClient = await connect(uri, options);
      return instance;
    } catch (e) {
      throw new Error(`Failed to connect to LanceDB: ${e}`);
    }
  }

  /**
   * @internal
   * Private constructor to enforce using the create factory method
   */
  private constructor() {
    super();
  }

  close() {
    if (this.lanceClient) {
      this.lanceClient.close();
    }
  }

  query<E extends QueryVectorArgs = QueryVectorArgs>(
    ...args: ParamsToArgs<QueryVectorParams> | E
  ): Promise<QueryResult[]> {
    throw new Error('Method not implemented.');
  }

  upsert<E extends UpsertVectorArgs = UpsertVectorArgs>(
    ...args: ParamsToArgs<UpsertVectorParams> | E
  ): Promise<string[]> {
    throw new Error('Method not implemented.');
  }

  async createTable(
    tableName: string,
    data: Record<string, unknown>[] | TableLike,
    options?: Partial<CreateTableOptions>,
  ): Promise<Table> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }
    return await this.lanceClient.createTable(tableName, data, options);
  }

  /**
   * indexName is actually the column name in the table
   */
  async createIndex(...args: ParamsToArgs<LanceCreateIndexParams> | LanceCreateIndexArgs): Promise<void> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    const params = this.normalizeArgs<LanceCreateIndexParams, LanceCreateIndexArgs>('createIndex', args, [
      'indexConfig',
      'tableName',
    ]);

    const { tableName, indexName, dimension, metric = 'cosine', indexConfig = {} } = params;

    try {
      if (!tableName) {
        throw new Error('tableName is required');
      }

      if (!indexName) {
        throw new Error('indexName is required');
      }

      if (typeof dimension !== 'number' || dimension <= 0) {
        throw new Error('dimension must be a positive number');
      }

      const tables = await this.lanceClient.tableNames();
      if (!tables.includes(tableName)) {
        throw new Error(
          `Table ${tableName} does not exist. Please create the table first by calling createTable() method.`,
        );
      }

      const table = await this.lanceClient.openTable(tableName);

      const existingIndices = await table.indexStats(indexName);
      if (existingIndices !== undefined) {
        throw new Error('Index already exists');
      }

      // Convert metric to LanceDB metric
      type LanceMetric = 'cosine' | 'l2' | 'dot';
      let metricType: LanceMetric | undefined;
      if (metric === 'euclidean') {
        metricType = 'l2';
      } else if (metric === 'dotproduct') {
        metricType = 'dot';
      } else if (metric === 'cosine') {
        metricType = 'cosine';
      }

      if (indexConfig.type === 'ivfflat') {
        await table.createIndex(indexName, {
          config: Index.ivfPq({
            numPartitions: indexConfig.numPartitions || 128,
            numSubVectors: indexConfig.numSubVectors || 16,
            distanceType: metricType,
          }),
        });
      } else {
        // Default to HNSW PQ index
        console.log('Creating HNSW PQ index with config:', indexConfig);
        await table.createIndex(indexName, {
          config: Index.hnswPq({
            m: indexConfig?.hnsw?.m || 16,
            efConstruction: indexConfig?.hnsw?.efConstruction || 100,
          }),
        });
      }
    } catch (error: any) {
      throw new Error(`Failed to create index: ${error.message}`);
    }
  }

  async listIndexes(): Promise<string[]> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    try {
      const tables = await this.lanceClient.tableNames();
      const allIndices: string[] = [];

      for (const tableName of tables) {
        const table = await this.lanceClient.openTable(tableName);
        const tableIndices = await table.listIndices();
        allIndices.push(...tableIndices.map(index => index.name));
      }

      return allIndices;
    } catch (error: any) {
      throw new Error(`Failed to list indexes: ${error.message}`);
    }
  }

  async describeIndex(indexName: string): Promise<IndexStats> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    if (!indexName) {
      throw new Error('indexName is required');
    }

    try {
      const tables = await this.lanceClient.tableNames();

      for (const tableName of tables) {
        const table = await this.lanceClient.openTable(tableName);
        const tableIndices = await table.listIndices();
        const foundIndex = tableIndices.find(index => index.name === indexName);

        if (foundIndex) {
          const stats = await table.indexStats(foundIndex.name);
          console.log(stats);

          if (!stats) {
            throw new Error(`Index stats not found for index: ${indexName}`);
          }

          const schema = await table.schema();
          const vectorCol = foundIndex.columns[0] || 'vector';

          // Find the vector column in the schema
          const vectorField = schema.fields.find(field => field.name === vectorCol);
          const dimension = vectorField?.type?.['listSize'] || 0;

          return {
            dimension: dimension,
            metric: stats.distanceType as 'cosine' | 'euclidean' | 'dotproduct' | undefined,
            count: stats.numIndexedRows,
          };
        }
        //   try {
        //     // Since LanceDB doesn't provide detailed index stats directly,
        //     // we attempt to get the schema to extract vector dimension
        //     const schema = await table.schema();
        //     const vectorCol = foundIndex.columns[0] || 'vector';

        //     // Find the vector column in the schema
        //     const vectorField = schema.fields.find(field => field.name === vectorCol);
        //     const dimension = vectorField?.type?.['listSize'] || 0;

        //     // Get count of vectors in the table
        //     const countResult = await table.countRows();
        //     const count = typeof countResult === 'number' ? countResult : 0;

        //     // For metric, we default to 'cosine' as the most common
        //     return {
        //       dimension,
        //       metric: 'cosine',
        //       count,
        //     };
        //   } catch (innerError) {
        //     // If we fail to get detailed information, return defaults
        //     console.warn(`Could not get detailed index stats: ${innerError}`);
        //     return {
        //       dimension: 0,
        //       metric: 'cosine',
        //       count: 0,
        //     };
        //   }
        // }
      }

      throw new Error(`IndexName: ${indexName} not found`);
    } catch (error: any) {
      throw new Error(`Failed to describe index: ${error.message}`);
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    if (!indexName) {
      throw new Error('indexName is required');
    }

    try {
      const tables = await this.lanceClient.tableNames();

      for (const tableName of tables) {
        const table = await this.lanceClient.openTable(tableName);
        const tableIndices = await table.listIndices();
        const foundIndex = tableIndices.find(index => index.name === indexName);

        if (foundIndex) {
          await table.dropIndex(indexName);
          return;
        }
      }

      throw new Error(`Index ${indexName} not found`);
    } catch (error: any) {
      throw new Error(`Failed to delete index: ${error.message}`);
    }
  }
}
