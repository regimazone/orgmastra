import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { TracesStorage, TABLE_TRACES } from '@mastra/core/storage';
import type { PaginationInfo, StorageGetTracesArg } from '@mastra/core/storage';
import type { Trace } from '@mastra/core/telemetry';
import type { Db, MongoClientOptions } from 'mongodb';
import { MongoClient } from 'mongodb';
import type { StoreOperationsMongoDB } from '../operations';
import { safelyParseJSON, formatDateForMongoDB } from '../utils';

export interface MongoDBTracesConfig {
  url: string;
  dbName: string;
  options?: MongoClientOptions;
}

export class TracesMongoDB extends TracesStorage {
  #isConnected = false;
  #client: MongoClient;
  #db: Db | undefined;
  readonly #dbName: string;
  private operations: StoreOperationsMongoDB;

  constructor({ url, dbName, options, operations }: MongoDBTracesConfig & { operations: StoreOperationsMongoDB }) {
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

  async getTraces({
    name,
    scope,
    page = 0,
    perPage = 100,
    attributes,
    filters,
  }: {
    name?: string;
    scope?: string;
    page?: number;
    perPage?: number;
    attributes?: Record<string, string>;
    filters?: Record<string, any>;
  } = {}): Promise<Trace[]> {
    try {
      const collection = await this.getCollection(TABLE_TRACES);
      const query: any = {};

      if (name) {
        query.name = new RegExp(name, 'i');
      }

      if (scope) {
        query.scope = scope;
      }

      if (attributes) {
        // For MongoDB, we can query nested attributes directly
        for (const [key, value] of Object.entries(attributes)) {
          query[`attributes.${key}`] = value;
        }
      }

      if (filters) {
        Object.assign(query, filters);
      }

      const results = await collection
        .find(query)
        .sort({ startTime: -1 })
        .skip(page * perPage)
        .limit(perPage)
        .toArray();

      return results.map(row => ({
        id: row.id,
        parentSpanId: row.parentSpanId,
        traceId: row.traceId,
        name: row.name,
        scope: row.scope,
        kind: row.kind,
        status: typeof row.status === 'string' ? safelyParseJSON(row.status) : row.status,
        events: typeof row.events === 'string' ? safelyParseJSON(row.events) : row.events,
        links: typeof row.links === 'string' ? safelyParseJSON(row.links) : row.links,
        attributes: typeof row.attributes === 'string' ? safelyParseJSON(row.attributes) : row.attributes,
        startTime: formatDateForMongoDB(row.startTime),
        endTime: formatDateForMongoDB(row.endTime),
        other: typeof row.other === 'string' ? safelyParseJSON(row.other) : row.other,
        createdAt: formatDateForMongoDB(row.createdAt),
      })) as Trace[];
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_TRACES_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async getTracesPaginated(args: StorageGetTracesArg): Promise<PaginationInfo & { traces: Trace[] }> {
    try {
      const {
        name,
        scope,
        pagination = { page: 0, perPage: 100 },
        attributes,
        filters,
      } = args;

      const { page = 0, perPage = 100 } = pagination;
      const collection = await this.getCollection(TABLE_TRACES);
      const query: any = {};

      if (name) {
        query.name = new RegExp(name, 'i');
      }

      if (scope) {
        query.scope = scope;
      }

      if (attributes) {
        // For MongoDB, we can query nested attributes directly
        for (const [key, value] of Object.entries(attributes)) {
          query[`attributes.${key}`] = value;
        }
      }

      if (filters) {
        Object.assign(query, filters);
      }

      const total = await collection.countDocuments(query);

      if (total === 0) {
        return {
          traces: [],
          total: 0,
          page,
          perPage,
          hasMore: false,
        };
      }

      const currentOffset = page * perPage;
      const results = await collection
        .find(query)
        .sort({ startTime: -1 })
        .skip(currentOffset)
        .limit(perPage)
        .toArray();

      const traces = results.map(row => ({
        id: row.id,
        parentSpanId: row.parentSpanId,
        traceId: row.traceId,
        name: row.name,
        scope: row.scope,
        kind: row.kind,
        status: typeof row.status === 'string' ? safelyParseJSON(row.status) : row.status,
        events: typeof row.events === 'string' ? safelyParseJSON(row.events) : row.events,
        links: typeof row.links === 'string' ? safelyParseJSON(row.links) : row.links,
        attributes: typeof row.attributes === 'string' ? safelyParseJSON(row.attributes) : row.attributes,
        startTime: formatDateForMongoDB(row.startTime),
        endTime: formatDateForMongoDB(row.endTime),
        other: typeof row.other === 'string' ? safelyParseJSON(row.other) : row.other,
        createdAt: formatDateForMongoDB(row.createdAt),
      })) as Trace[];

      return {
        traces,
        total,
        page,
        perPage,
        hasMore: currentOffset + traces.length < total,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_GET_TRACES_PAGINATED_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  async saveTrace(trace: Trace): Promise<void> {
    try {
      // Prepare the trace for storage
      const traceRecord = {
        ...trace,
        status: typeof trace.status === 'object' ? JSON.stringify(trace.status) : trace.status,
        events: typeof trace.events === 'object' ? JSON.stringify(trace.events) : trace.events,
        links: typeof trace.links === 'object' ? JSON.stringify(trace.links) : trace.links,
        attributes: typeof trace.attributes === 'object' ? JSON.stringify(trace.attributes) : trace.attributes,
        other: typeof trace.other === 'object' ? JSON.stringify(trace.other) : trace.other,
      };

      await this.operations.insert({
        tableName: TABLE_TRACES,
        record: traceRecord,
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'MONGODB_STORE_SAVE_TRACE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { traceId: trace.id },
        },
        error,
      );
    }
  }
}