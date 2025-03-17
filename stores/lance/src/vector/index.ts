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

interface LanceCreateIndexParams extends CreateIndexParams {
  indexConfig?: IndexConfig;
  tableName?: string;
}

type LanceCreateIndexArgs = [...CreateIndexArgs, IndexConfig?, boolean?];

export class LanceVectorStore extends MastraVector {
  private lanceClient!: Connection;

  /**
   * @param uri The URI to connect to LanceDB
   * @param options connection options
   *
   * Usage:
   *
   * Connect to a local database
   * ```ts
   * const store = new LanceVectorStore('/path/to/db');
   * ```
   *
   * Connect to a LanceDB cloud database
   * ```ts
   * const store = new LanceVectorStore('db://host:port');
   * ```
   *
   * Connect to a cloud database
   * ```ts
   * const store = new LanceVectorStore('s3://bucket/db', { storageOptions: { timeout: '60s' } });
   * ```
   * @internal
   * Note: LanceDB doesn't expose any constructor to use an object directly.
   * Instead it exposes a async connect function. Here we use the same signature
   * as the other providers to provide a unified interface.
   */
  constructor(uri: string, options?: ConnectionOptions) {
    super();
    connect(uri, options)
      .then(client => {
        this.lanceClient = client;
      })
      .catch(e => {
        throw new Error(`Failed to connect to LanceDB: ${e}`);
      });
  }

  async close() {
    this.lanceClient.close();
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
    return await this.lanceClient.createTable(tableName, data, options);
  }

  async createIndex(...args: ParamsToArgs<LanceCreateIndexParams> | LanceCreateIndexArgs): Promise<void> {
    const params = this.normalizeArgs<LanceCreateIndexParams, LanceCreateIndexArgs>('createIndex', args, [
      'indexConfig',
      'tableName',
    ]);

    const { tableName, indexName, dimension, metric = 'cosine', indexConfig = {} } = params;

    try {
      if (!tableName) {
        throw new Error('tableName is required');
      }

      const tables = await this.lanceClient.tableNames();
      if (!tables.includes(tableName)) {
        throw new Error(
          `Table ${tableName} does not exist. Please create the table first by calling createTable() method.`,
        );
      }

      const table = await this.lanceClient.openTable(tableName);

      if (indexConfig.type === 'ivfflat') {
        await table.createIndex(indexName, {
          config: Index.ivfPq({
            numPartitions: 128,
            numSubVectors: 16,
          }),
        });

        return;
      }

      await table.createIndex(indexName, {
        config: Index.hnswPq({
          m: 16,
          efConstruction: 100,
        }),
      });
    } catch (error: any) {
      throw new Error(`Failed to create index: ${error.message}`);
    }
  }

  listIndexes(): Promise<string[]> {
    throw new Error('Method not implemented.');
  }
  describeIndex(indexName: string): Promise<IndexStats> {
    throw new Error('Method not implemented.');
  }
  deleteIndex(indexName: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
