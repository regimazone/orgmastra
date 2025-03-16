import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions } from '@lancedb/lancedb';

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

interface LanceIndexParams extends CreateIndexParams {
  indexConfig?: IndexConfig;
}

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
  createIndex<E extends CreateIndexArgs = CreateIndexArgs>(
    ...args: ParamsToArgs<CreateIndexParams> | E
  ): Promise<void> {
    throw new Error('Method not implemented.');
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
