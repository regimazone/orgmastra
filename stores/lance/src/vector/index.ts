import { connect, Index } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions, CreateTableOptions, Table, TableLike } from '@lancedb/lancedb';

import type {
  CreateIndexArgs,
  CreateIndexParams,
  IndexStats,
  ParamsToArgs,
  QueryResult,
  QueryVectorParams,
  UpsertVectorParams,
} from '@mastra/core';

import { MastraVector } from '@mastra/core';
import type { VectorFilter } from '@mastra/core/vector/filter';
import type { IndexConfig } from './types';

interface LanceCreateIndexParams extends CreateIndexParams {
  indexConfig?: LanceIndexConfig;
  tableName?: string;
}

interface LanceIndexConfig extends IndexConfig {
  numPartitions?: number;
  numSubVectors?: number;
}

interface LanceUpsertVectorParams extends UpsertVectorParams {
  tableName: string;
}

interface LanceQueryVectorParams extends QueryVectorParams {
  tableName: string;
  columns?: string[];
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

  async query(...args: ParamsToArgs<LanceQueryVectorParams>): Promise<QueryResult[]> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }
    const params = this.normalizeArgs<LanceQueryVectorParams>('query', args);
    const { tableName, queryVector, topK = 10, filter, includeVector = false, columns = [] } = params;

    if (!tableName) {
      throw new Error('tableName is required');
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      throw new Error('columns array is required and must not be empty');
    }

    if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
      throw new Error('queryVector array is required and must not be empty');
    }

    try {
      const filterString = filter ? this.filterStringBuilder(filter) : '';

      const table = await this.lanceClient.openTable(tableName);

      // Make sure we're selecting the id field explicitly
      if (!columns.includes('id')) {
        columns.push('id');
      }

      const query = table.query().nearestTo(queryVector).select(columns).limit(topK);
      const results = await query.toArray();

      return results.map(result => ({
        id: String(result.id),
        metadata: JSON.parse(result.metadata),
        // Convert Vector object to plain array if includeVector is true
        vector: includeVector ? (Array.isArray(result.vector) ? result.vector : Array.from(result.vector)) : undefined,
        document: result.document,
        score: result.score,
      }));
    } catch (error: any) {
      throw new Error(`Failed to query: ${error}`);
    }
  }

  private filterStringBuilder(filter: VectorFilter): string {
    throw new Error('Function not implemented.');
  }

  async upsert(...args: ParamsToArgs<LanceUpsertVectorParams>): Promise<string[]> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    const params = this.normalizeArgs<LanceUpsertVectorParams>('upsert', args);
    const { tableName, indexName, vectors, metadata = [], ids = [] } = params;

    if (!tableName) {
      throw new Error('tableName is required');
    }

    if (!indexName) {
      throw new Error('indexName is required');
    }

    if (!vectors || !Array.isArray(vectors) || vectors.length === 0) {
      throw new Error('vectors array is required and must not be empty');
    }

    try {
      const tables = await this.lanceClient.tableNames();
      if (!tables.includes(tableName)) {
        throw new Error(`Table ${tableName} does not exist`);
      }

      const table = await this.lanceClient.openTable(tableName);

      // Generate IDs if not provided
      const vectorIds = ids.length === vectors.length ? ids : vectors.map((_, i) => ids[i] || crypto.randomUUID());

      const data = vectors.map((vector, i) => {
        const id = String(vectorIds[i]);
        return {
          id,
          [indexName]: vector,
          metadata: JSON.stringify(metadata[i] || {}),
        };
      });

      await table.add(data, { mode: 'overwrite' });

      return vectorIds;
    } catch (error: any) {
      throw new Error(`Failed to upsert vectors: ${error.message}`);
    }
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
   * indexName is actually a column name in a table in lanceDB
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
            distanceType: metricType,
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
        console.debug('Checking table:', tableName);
        const table = await this.lanceClient.openTable(tableName);
        const tableIndices = await table.listIndices();
        const foundIndex = tableIndices.find(index => index.name === indexName);

        if (foundIndex) {
          const stats = await table.indexStats(foundIndex.name);

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

  /**
   * Deletes all tables in the database
   */
  async deleteAllTables(): Promise<void> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    try {
      await this.lanceClient.dropAllTables();
    } catch (error: any) {
      throw new Error(`Failed to delete tables: ${error.message}`);
    }
  }

  async deleteTable(tableName: string): Promise<void> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    try {
      await this.lanceClient.dropTable(tableName);
    } catch (error: any) {
      throw new Error(`Failed to delete tables: ${error.message}`);
    }
  }

  async updateIndexById(
    _indexName: string,
    _id: string,
    _update: { vector?: number[]; metadata?: Record<string, any> },
  ): Promise<void> {
    try {
      // In LanceDB, the indexName is actually a column name in a table
      // We need to find which table has this column as an index
      const tables = await this.lanceClient.tableNames();

      for (const tableName of tables) {
        console.debug('Checking table:', tableName);
        const table = await this.lanceClient.openTable(tableName);

        try {
          const schema = await table.schema();
          const hasColumn = schema.fields.some(field => field.name === _indexName);

          if (hasColumn) {
            console.debug(`Found column ${_indexName} in table ${tableName}`);

            // First, query the existing record to preserve values that aren't being updated
            const existingRecord = await table
              .query()
              .where(`id = '${_id}'`)
              .select(['id', _indexName, 'metadata'])
              .limit(1)
              .toArray();

            if (existingRecord === undefined) {
              throw new Error(`Record with id '${_id}' not found in table ${tableName}`);
            }

            // For vector updates, we need to use the add method with overwrite mode
            // since update doesn't directly support vector array types
            if (_update.vector || _update.metadata) {
              const data = [
                {
                  id: _id,
                  [_indexName]: _update.vector || JSON.stringify(existingRecord[0].vector),
                  metadata: _update.metadata ? JSON.stringify(_update.metadata) : existingRecord[0].metadata,
                },
              ];

              await table.add(data, { mode: 'overwrite' });
              return;
            }
          }
        } catch (err) {
          console.error(`Error checking schema for table ${tableName}:`, err);
          // Continue to the next table if there's an error
          continue;
        }
      }

      throw new Error(`No table found with column/index '${_indexName}'`);
    } catch (error: any) {
      throw new Error(`Failed to update index: ${error.message}`);
    }
  }

  async deleteIndexById(_indexName: string, _id: string): Promise<void> {
    if (!this.lanceClient) {
      throw new Error('LanceDB client not initialized. Use LanceVectorStore.create() to create an instance');
    }

    if (!_indexName) {
      throw new Error('indexName is required');
    }

    if (!_id) {
      throw new Error('id is required');
    }

    try {
      // In LanceDB, the indexName is actually a column name in a table
      // We need to find which table has this column as an index
      const tables = await this.lanceClient.tableNames();

      for (const tableName of tables) {
        console.debug('Checking table:', tableName);
        const table = await this.lanceClient.openTable(tableName);

        try {
          // Try to get the schema to check if this table has the column we're looking for
          const schema = await table.schema();
          const hasColumn = schema.fields.some(field => field.name === _indexName);

          if (hasColumn) {
            console.debug(`Found column ${_indexName} in table ${tableName}`);
            await table.delete(`id = '${_id}'`);
            return;
          }
        } catch (err) {
          console.error(`Error checking schema for table ${tableName}:`, err);
          // Continue to the next table if there's an error
          continue;
        }
      }

      throw new Error(`No table found with column/index '${_indexName}'`);
    } catch (error: any) {
      throw new Error(`Failed to delete index: ${error.message}`);
    }
  }
}
