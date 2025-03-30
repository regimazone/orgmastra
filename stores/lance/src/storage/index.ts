import { MastraStorage } from '@mastra/core';
import type { EvalRow, MessageType, StorageGetMessagesArg, StorageThreadType } from '@mastra/core';
import type { TABLE_NAMES } from '@mastra/core/storage';

export class LanceStorage extends MastraStorage {
  createTable({ tableName, schema }: { tableName: TABLE_NAMES; schema: Record<string, unknown> }): Promise<void> {
    throw new Error('Method not implemented.');
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
