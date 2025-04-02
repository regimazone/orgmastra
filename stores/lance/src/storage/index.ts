import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions, SchemaLike, FieldLike } from '@lancedb/lancedb';
import type { EvalRow, MessageType, StorageColumn, StorageGetMessagesArg, StorageThreadType } from '@mastra/core';
import { MastraStorage } from '@mastra/core/storage';
import type { TABLE_NAMES } from '@mastra/core/storage';
import type { DataType } from 'apache-arrow';
import { Utf8, Int32, Float32, Binary, Schema, Field, Timestamp, TimeUnit } from 'apache-arrow';

export class LanceStorage extends MastraStorage {
  private lanceClient!: Connection;

  /**
   * Creates a new instance of LanceStorage
   * @param uri The URI to connect to LanceDB
   * @param options connection options
   *
   * Usage:
   *
   * Connect to a local database
   * ```ts
   * const store = await LanceStorage.create('/path/to/db');
   * ```
   *
   * Connect to a LanceDB cloud database
   * ```ts
   * const store = await LanceStorage.create('db://host:port');
   * ```
   *
   * Connect to a cloud database
   * ```ts
   * const store = await LanceStorage.create('s3://bucket/db', { storageOptions: { timeout: '60s' } });
   * ```
   */
  public static async create(name: string, uri: string, options?: ConnectionOptions): Promise<LanceStorage> {
    const instance = new LanceStorage(name);
    try {
      instance.lanceClient = await connect(uri, options);
      return instance;
    } catch (e: any) {
      throw new Error(`Failed to connect to LanceDB: ${e}`);
    }
  }

  /**
   * @internal
   * Private constructor to enforce using the create factory method
   */
  private constructor(name: string) {
    super({ name });
  }

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    try {
      const arrowSchema = this.translateSchema(schema);
      await this.lanceClient.createEmptyTable(tableName, arrowSchema);
    } catch (error: any) {
      throw new Error(`Failed to create table: ${error}`);
    }
  }

  private translateSchema(schema: Record<string, StorageColumn>): Schema {
    const fields = Object.entries(schema).map(([name, column]) => {
      // Convert string type to Arrow DataType
      let arrowType: DataType;
      switch (column.type.toLowerCase()) {
        case 'text':
          arrowType = new Utf8();
          break;
        case 'int':
        case 'integer':
          arrowType = new Int32();
          break;
        case 'float':
          arrowType = new Float32();
          break;
        case 'jsonb':
        case 'json':
          // JSON is typically stored as Utf8 (string) in Arrow
          arrowType = new Utf8();
          break;
        case 'binary':
          arrowType = new Binary();
          break;
        case 'timestamp':
          arrowType = new Timestamp(TimeUnit.SECOND);
        default:
          // Default to string for unknown types
          arrowType = new Utf8();
      }

      // Create a field with the appropriate arrow type
      return new Field(name, arrowType, column.nullable ?? true);
    });

    return new Schema(fields);
  }

  /**
   * Drop a table if it exists
   * @param tableName Name of the table to drop
   */
  async dropTable(tableName: TABLE_NAMES): Promise<void> {
    try {
      await this.lanceClient.dropTable(tableName);
    } catch (error: any) {
      throw new Error(`Failed to drop table: ${error}`);
    }
  }

  /**
   * Get table schema
   * @param tableName Name of the table
   * @returns Table schema
   */
  async getTableSchema(tableName: TABLE_NAMES): Promise<SchemaLike> {
    try {
      const table = await this.lanceClient.openTable(tableName);
      const rawSchema = await table.schema();
      const fields = rawSchema.fields as FieldLike[];

      // Convert schema to SchemaLike format
      return {
        fields,
        metadata: new Map<string, string>(),
        get names() {
          return fields.map((field: FieldLike) => field.name);
        },
      };
    } catch (error: any) {
      throw new Error(`Failed to get table schema: ${error}`);
    }
  }

  async clearTable({ tableName }: { tableName: string }): Promise<void> {
    const table = await this.lanceClient.openTable(tableName);
    const batchSize = 1000;
    let hasMoreRecords = true;

    while (hasMoreRecords) {
      // Fetch a batch of records
      const records = await table.query().limit(batchSize).toArray();

      if (records.length === 0) {
        hasMoreRecords = false;
        break;
      }

      const ids = records.map(record => record.id);

      if (ids.length > 0) {
        const idList = ids.map(id => (typeof id === 'string' ? `'${id}'` : id)).join(', ');
        await table.delete(`id IN (${idList})`);
      }

      // Check if we got fewer records than the batch size, which means we're done
      if (records.length < batchSize) {
        hasMoreRecords = false;
      }
    }
  }

  async insert({ tableName, record }: { tableName: string; record: Record<string, any> }): Promise<void> {
    try {
      const table = await this.lanceClient.openTable(tableName);

      const processedRecord = { ...record };

      // Convert all object values to strings
      for (const key in processedRecord) {
        if (
          processedRecord[key] !== null &&
          typeof processedRecord[key] === 'object' &&
          !(processedRecord[key] instanceof Date)
        ) {
          processedRecord[key] = JSON.stringify(processedRecord[key]);
        }
      }

      await table.add([processedRecord], { mode: 'overwrite' });

      const res = await table.query().limit(1).toArray();
      console.log(res);
    } catch (error: any) {
      throw new Error(`Failed to insert record: ${error}`);
    }
  }

  async batchInsert({ tableName, records }: { tableName: string; records: Record<string, any>[] }): Promise<void> {
    try {
      const table = await this.lanceClient.openTable(tableName);

      const processedRecords = records.map(record => {
        const processedRecord = { ...record };

        // Convert all object values to strings
        for (const key in processedRecord) {
          if (
            processedRecord[key] !== null &&
            typeof processedRecord[key] === 'object' &&
            !(processedRecord[key] instanceof Date)
          ) {
            processedRecord[key] = JSON.stringify(processedRecord[key]);
          }
        }
        return processedRecord;
      });

      await table.add(processedRecords, { mode: 'overwrite' });
    } catch (error: any) {
      throw new Error(`Failed to insert batch records: ${error}`);
    }
  }

  async load({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, any> }): Promise<any> {
    try {
      const table = await this.lanceClient.openTable(tableName);
      const tableSchema = await this.getTableSchema(tableName);
      const query = table.query();

      // Build filter condition with 'and' between all conditions
      if (Object.keys(keys).length > 0) {
        const filterConditions = Object.entries(keys)
          .map(([key, value]) => {
            // Handle different types appropriately
            if (typeof value === 'string') {
              return `${key} = '${value}'`;
            } else if (value === null) {
              return `${key} IS NULL`;
            } else {
              // For numbers, booleans, etc.
              return `${key} = ${value}`;
            }
          })
          .join(' AND ');

        query.where(filterConditions);
      }

      const result = await query.limit(1).toArray();

      if (result.length === 0) {
        return null;
      }

      // Convert serialized JSON strings back to objects
      const processedResult = { ...result[0] };

      // Get field types from the schema to convert values back to their original types
      const fieldTypes = new Map(tableSchema.fields.map((field: any) => [field.name, field.type]));

      for (const key in processedResult) {
        // Handle JSON fields stored as strings
        if (typeof processedResult[key] === 'string') {
          // Try to parse JSON for metadata fields
          if (key === 'metadata' || fieldTypes.get(key)?.toString().includes('json')) {
            try {
              processedResult[key] = JSON.parse(processedResult[key]);
            } catch (e) {
              // Not a JSON string, keep as is
            }
          }
        }

        // Convert timestamps back to Date objects
        if (key === 'createdAt' || fieldTypes.get(key)?.toString().includes('timestamp')) {
          if (typeof processedResult[key] === 'string') {
            processedResult[key] = new Date(processedResult[key]);
          }
        }

        // Convert numeric strings back to numbers if schema indicates numeric type
        if (
          (key === 'number' || fieldTypes.get(key)?.toString().includes('int')) &&
          typeof processedResult[key] === 'string' &&
          !isNaN(Number(processedResult[key]))
        ) {
          processedResult[key] = Number(processedResult[key]);
        }
      }

      return processedResult;
    } catch (error: any) {
      throw new Error(`Failed to load record: ${error}`);
    }
  }

  getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    throw new Error('Method not implemented.');
  }
  getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
    throw new Error('Method not implemented.');
  }
  saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    throw new Error('Method not implemented.');
  }
  updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    throw new Error('Method not implemented.');
  }
  deleteThread({ threadId }: { threadId: string }): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getMessages({ threadId, selectBy, threadConfig }: StorageGetMessagesArg): Promise<MessageType[]> {
    throw new Error('Method not implemented.');
  }
  saveMessages({ messages }: { messages: MessageType[] }): Promise<MessageType[]> {
    throw new Error('Method not implemented.');
  }
  getTraces({
    name,
    scope,
    page,
    perPage,
    attributes,
  }: {
    name?: string;
    scope?: string;
    page: number;
    perPage: number;
    attributes?: Record<string, string>;
  }): Promise<any[]> {
    throw new Error('Method not implemented.');
  }
  getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]> {
    throw new Error('Method not implemented.');
  }
}
