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
import { LanceFilterTranslator } from './filter';

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
    const { tableName, queryVector, topK = 10, filter = {}, includeVector = false, columns = [] } = params;

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
      const table = await this.lanceClient.openTable(tableName);

      // Get the schema to know what columns are actually available
      const schema = await table.schema();
      const availableColumns = schema.fields.map(field => field.name);

      // Determine which columns to select
      let selectColumns = [...columns];

      // Make sure we're selecting the id field explicitly
      if (!selectColumns.includes('id')) {
        selectColumns.push('id');
      }

      // Handle the special case where 'metadata' is requested
      // The 'metadata' column doesn't exist since metadata fields are stored as top-level columns
      const hasMetadataColumn = selectColumns.includes('metadata');
      if (hasMetadataColumn) {
        // Remove 'metadata' from the selection since it's not a real column
        selectColumns = selectColumns.filter(col => col !== 'metadata');

        // Include all available columns except special ones to capture all potential metadata fields
        selectColumns = [
          ...new Set([
            ...selectColumns,
            ...availableColumns.filter(col => col !== 'id' && col !== 'vector' && col !== '_distance'),
          ]),
        ];
      }

      let query = table.query().nearestTo(queryVector).select(selectColumns).limit(topK);

      // Only apply where clause if the filter is not empty
      if (filter && Object.keys(filter).length > 0) {
        const translatedFilter = this.filterTranslator(filter);
        if (translatedFilter) {
          query = query.where(translatedFilter);
        }
      }

      const results = await query.toArray();

      return results.map(result => {
        // Build metadata object by collecting all keys except for specific reserved fields
        const metadata: Record<string, any> = {};

        // Get all keys from the result object
        Object.keys(result).forEach(key => {
          // Skip reserved keys (id, score, and the vector column)
          if (key !== 'id' && key !== 'score' && key !== 'vector' && key !== '_distance') {
            metadata[key] = result[key];
          }
        });

        return {
          id: String(result.id),
          metadata,
          // Convert Vector object to plain array if includeVector is true
          vector: includeVector
            ? Array.isArray(result.vector)
              ? result.vector
              : Array.from(result.vector as any[])
            : undefined,
          document: result.document,
          score: result._distance,
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to query: ${error}`);
    }
  }

  private filterTranslator(filter: VectorFilter): string {
    const translator = new LanceFilterTranslator();
    return translator.translate(filter);
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

      // Create data with metadata fields expanded at the top level
      const data = vectors.map((vector, i) => {
        const id = String(vectorIds[i]);
        const metadataItem = metadata[i] || {};

        // Create the base object with id and vector
        const rowData: Record<string, any> = {
          id,
          vector: vector,
        };

        // Add all metadata properties directly to the row data object
        Object.entries(metadataItem).forEach(([key, value]) => {
          rowData[key] = value;
        });

        return rowData;
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
          const schema = await table.schema();
          const hasColumn = schema.fields.some(field => field.name === _indexName);

          if (hasColumn) {
            console.debug(`Found column ${_indexName} in table ${tableName}`);

            // First, query the existing record to preserve values that aren't being updated
            const existingRecord = await table
              .query()
              .where(`id = '${_id}'`)
              .select(schema.fields.map(field => field.name))
              .limit(1)
              .toArray();

            if (existingRecord.length === 0) {
              throw new Error(`Record with id '${_id}' not found in table ${tableName}`);
            }

            // Create a clean data object for update
            const rowData: Record<string, any> = {
              id: _id,
            };

            // Copy all existing field values except special fields
            Object.entries(existingRecord[0]).forEach(([key, value]) => {
              // Skip special fields
              if (key !== 'id' && key !== '_distance') {
                // Handle vector field specially to avoid nested properties
                if (key === _indexName) {
                  // If we're about to update this vector anyway, skip copying
                  if (!_update.vector) {
                    // Ensure vector is a plain array
                    if (Array.isArray(value)) {
                      rowData[key] = [...value];
                    } else if (typeof value === 'object' && value !== null) {
                      // Handle vector objects by converting to array if needed
                      rowData[key] = Array.from(value as any[]);
                    } else {
                      rowData[key] = value;
                    }
                  }
                } else {
                  rowData[key] = value;
                }
              }
            });

            // Apply the vector update if provided
            if (_update.vector) {
              rowData[_indexName] = _update.vector;
            }

            // Apply metadata updates if provided
            if (_update.metadata) {
              Object.entries(_update.metadata).forEach(([key, value]) => {
                rowData[key] = value;
              });
            }

            // Update the record
            await table.add([rowData], { mode: 'overwrite' });
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
