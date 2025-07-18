import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { StoreOperations } from '@mastra/core/storage';
import type { StorageColumn, TABLE_NAMES } from '@mastra/core/storage';
import type { Db, MongoClientOptions } from 'mongodb';
import { MongoClient } from 'mongodb';
import { safelyParseJSON } from '../utils';

export interface MongoDBOperationsConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class StoreOperationsMongoDB extends StoreOperations {
  #isConnected = false;
  #client: MongoClient;
  #db: Db | undefined;
  readonly #dbName: string;

  constructor(config: MongoDBOperationsConfig) {
    super();
    this.#isConnected = false;

    try {
      if (!config.url?.trim().length) {
        throw new Error(
          'StoreOperationsMongoDB: url must be provided and cannot be empty. Passing an empty string may cause fallback to local MongoDB defaults.',
        );
      }

      if (!config.dbName?.trim().length) {
        throw new Error(
          'StoreOperationsMongoDB: dbName must be provided and cannot be empty. Passing an empty string may cause fallback to local MongoDB defaults.',
        );
      }
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_OPERATIONS_CONSTRUCTOR_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
          details: { url: config.url, dbName: config.dbName },
        },
        error,
      );
    }

    this.#dbName = config.dbName;
    this.#client = new MongoClient(config.url, config.options);
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

  async hasColumn(table: string, column: string): Promise<boolean> {
    // MongoDB is schemaless, so we can assume any column exists
    // We could check a sample document, but for now return true
    return true;
  }

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    try {
      this.logger.debug(`Creating MongoDB collection`, { tableName, operation: 'schema init' });
      
      // MongoDB collections are created automatically when first document is inserted
      // We can create indexes here if needed based on the schema
      const collection = await this.getCollection(tableName);
      
      // Create indexes for primary keys and other important fields
      const indexes = [];
      for (const [fieldName, column] of Object.entries(schema)) {
        if (column.primaryKey) {
          indexes.push({ key: { [fieldName]: 1 }, unique: true });
        }
      }
      
      if (indexes.length > 0) {
        await collection.createIndexes(indexes);
      }
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_CREATE_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: {
            tableName,
          },
        },
        error,
      );
    }
  }

  async alterTable({
    tableName,
    schema,
    ifNotExists,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    // MongoDB is schemaless, so altering table is essentially a no-op
    // We could create additional indexes if needed
    this.logger.debug(`MongoDB alterTable is no-op for schemaless database`, { tableName, ifNotExists });
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      const collection = await this.getCollection(tableName);
      await collection.deleteMany({});
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_CLEAR_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      const collection = await this.getCollection(tableName);
      await collection.drop();
    } catch (error) {
      // Collection might not exist, which is fine
      if (error instanceof Error && error.message.includes('ns not found')) {
        return;
      }
      throw new MastraError(
        {
          id: 'MONGODB_STORE_DROP_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    try {
      const collection = await this.getCollection(tableName);

      // Process the record for MongoDB storage
      const recordToInsert = { ...record };
      
      // Handle JSON fields
      for (const [key, value] of Object.entries(recordToInsert)) {
        if (typeof value === 'string') {
          try {
            // Try to parse as JSON if it looks like JSON
            if (value.startsWith('{') || value.startsWith('[')) {
              recordToInsert[key] = JSON.parse(value);
            }
          } catch {
            // Keep as string if parsing fails
          }
        }
      }

      await collection.insertOne(recordToInsert);
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_INSERT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, any> }): Promise<R | null> {
    try {
      const collection = await this.getCollection(tableName);
      const result = await collection.findOne(keys);
      return result as R;
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_LOAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async close(): Promise<void> {
    try {
      await this.#client.close();
      this.#isConnected = false;
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_OPERATIONS_CLOSE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
        },
        error,
      );
    }
  }
}