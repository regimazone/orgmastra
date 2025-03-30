import { connect } from '@lancedb/lancedb';
import type { Connection, ConnectionOptions } from '@lancedb/lancedb';
import type { EvalRow, MessageType, StorageColumn, StorageGetMessagesArg, StorageThreadType } from '@mastra/core';
import { MastraStorage } from '@mastra/core/storage';
import type { TABLE_NAMES } from '@mastra/core/storage';

export interface LanceStorageColumn extends StorageColumn {
  columnName: string;
}
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
    schema: Record<string, LanceStorageColumn>;
  }): Promise<void> {
    try {
      // await this.lanceClient.createEmptyTable(tableName, schema);
    } catch (error: any) {
      throw new Error(`Failed to create table: ${error}`);
    }
  }
  clearTable(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  insert(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  batchInsert(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, string> }): Promise<any> {
    throw new Error('Method not implemented.');
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
