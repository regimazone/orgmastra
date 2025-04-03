import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions, SchemaLike, FieldLike } from '@lancedb/lancedb';
import type {
  EvalRow,
  MessageType,
  StorageColumn,
  StorageGetMessagesArg,
  StorageThreadType,
  WorkflowRuns,
} from '@mastra/core';
import { MastraStorage } from '@mastra/core/storage';
import type { TABLE_NAMES } from '@mastra/core/storage';
import type { DataType } from 'apache-arrow';
import { Utf8, Int32, Int64, Float32, Binary, Schema, Field, Timestamp, TimeUnit } from 'apache-arrow';

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
        case 'uuid':
          arrowType = new Utf8();
          break;
        case 'int':
        case 'integer':
          arrowType = new Int32();
          break;
        case 'bigint':
          // Use Int64 for bigint fields
          arrowType = new Int64();
          break;
        case 'float':
          arrowType = new Float32();
          break;
        case 'jsonb':
        case 'json':
          arrowType = new Utf8();
          break;
        case 'binary':
          arrowType = new Binary();
          break;
        case 'timestamp':
          arrowType = new Float32();
          break;
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
      console.log(rawSchema);

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
    } catch (error: any) {
      throw new Error(`Failed to insert record: ${error}`);
    }
  }

  async batchInsert({ tableName, records }: { tableName: string; records: Record<string, any>[] }): Promise<void> {
    try {
      const table = await this.lanceClient.openTable(tableName);
      const tableSchema = await table.schema();

      const processedRecords = records.map(record => {
        const processedRecord = { ...record };

        // Convert values based on schema type
        for (const key in processedRecord) {
          // Skip null/undefined values
          if (processedRecord[key] == null) continue;

          // Find the field definition in the schema
          const field = tableSchema.fields.find((f: any) => f.name === key);
          if (!field) continue;

          const fieldType = field.type.toString().toLowerCase();

          // Handle specific type conversions
          if (fieldType === 'int64' && typeof processedRecord[key] === 'number') {
            // Convert number to BigInt for Int64 fields
            processedRecord[key] = BigInt(Math.floor(processedRecord[key]));
          } else if (
            processedRecord[key] !== null &&
            typeof processedRecord[key] === 'object' &&
            !(processedRecord[key] instanceof Date)
          ) {
            // Convert objects to JSON strings
            processedRecord[key] = JSON.stringify(processedRecord[key]);
          }
        }

        return processedRecord;
      });

      await table.add(processedRecords, { mode: 'overwrite' });
    } catch (error: any) {
      throw new Error(`Failed to batch insert records: ${error}`);
    }
  }

  /**
   * Load a record from the database by its key(s)
   * @param tableName The name of the table to query
   * @param keys Record of key-value pairs to use for lookup
   * @throws Error if invalid types are provided for keys
   * @returns The loaded record with proper type conversions, or null if not found
   */
  async load({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, any> }): Promise<any> {
    try {
      const table = await this.lanceClient.openTable(tableName);
      const tableSchema = await this.getTableSchema(tableName);
      const query = table.query();

      // Build filter condition with 'and' between all conditions
      if (Object.keys(keys).length > 0) {
        // Validate key types against schema
        this.validateKeyTypes(keys, tableSchema);

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
        console.debug('where clause generated: ', filterConditions);
        query.where(filterConditions);
      }

      const result = await query.limit(1).toArray();

      if (result.length === 0) {
        return null;
      }

      console.log(tableSchema);
      // Process the result with type conversions
      return this.processResultWithTypeConversion(result[0], tableSchema);
    } catch (error: any) {
      throw new Error(`Failed to load record: ${error}`);
    }
  }

  /**
   * Validates that key types match the schema definition
   * @param keys The keys to validate
   * @param tableSchema The table schema to validate against
   * @throws Error if a key has an incompatible type
   */
  private validateKeyTypes(keys: Record<string, any>, tableSchema: SchemaLike): void {
    // Create a map of field names to their expected types
    const fieldTypes = new Map(
      tableSchema.fields.map((field: any) => [field.name, field.type?.toString().toLowerCase()]),
    );

    for (const [key, value] of Object.entries(keys)) {
      const fieldType = fieldTypes.get(key);

      if (!fieldType) {
        throw new Error(`Field '${key}' does not exist in table schema`);
      }

      // Type validation
      if (value !== null) {
        if ((fieldType.includes('int') || fieldType.includes('bigint')) && typeof value !== 'number') {
          throw new Error(`Expected numeric value for field '${key}', got ${typeof value}`);
        }

        if (fieldType.includes('utf8') && typeof value !== 'string') {
          throw new Error(`Expected string value for field '${key}', got ${typeof value}`);
        }

        if (fieldType.includes('timestamp') && !(value instanceof Date) && typeof value !== 'string') {
          throw new Error(`Expected Date or string value for field '${key}', got ${typeof value}`);
        }
      }
    }
  }

  /**
   * Process a database result with appropriate type conversions based on the table schema
   * @param rawResult The raw result object from the database
   * @param tableSchema The schema of the table containing type information
   * @returns Processed result with correct data types
   */
  private processResultWithTypeConversion(
    rawResult: Record<string, any>,
    tableSchema: SchemaLike,
  ): Record<string, any> {
    const processedResult = { ...rawResult };
    const fieldTypeMap = new Map();

    // Build a map of field names to their schema types
    tableSchema.fields.forEach((field: any) => {
      const fieldName = field.name;
      const fieldTypeStr = field.type.toString().toLowerCase();
      fieldTypeMap.set(fieldName, fieldTypeStr);
    });

    // Convert each field according to its schema type
    for (const key in processedResult) {
      const fieldTypeStr = fieldTypeMap.get(key);
      if (!fieldTypeStr) continue;
      // Only try to convert string values
      if (typeof processedResult[key] === 'string') {
        // Numeric types
        if (fieldTypeStr.includes('int32') || fieldTypeStr.includes('float32')) {
          if (!isNaN(Number(processedResult[key]))) {
            processedResult[key] = Number(processedResult[key]);
          }
        } else if (fieldTypeStr.includes('int64')) {
          processedResult[key] = Number(processedResult[key]);
        } else if (fieldTypeStr.includes('utf8')) {
          try {
            processedResult[key] = JSON.parse(processedResult[key]);
          } catch (e) {
            // If JSON parsing fails, keep the original string
            console.debug(`Failed to parse JSON for key ${key}: ${e}`);
          }
        }
      } else if (typeof processedResult[key] === 'bigint') {
        // Convert BigInt values to regular numbers for application layer
        processedResult[key] = Number(processedResult[key]);
      }
    }

    return processedResult;
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

  getWorkflowRuns(args?: {
    namespace?: string;
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowRuns> {
    throw new Error('Method not implemented.');
  }
}
