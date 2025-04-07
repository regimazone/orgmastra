import type { MessageType, StorageThreadType, TraceType } from '@mastra/core';
import { TABLE_MESSAGES, TABLE_SCHEMAS, TABLE_THREADS, TABLE_TRACES } from '@mastra/core/storage';
import type { StorageColumn } from '@mastra/core/storage';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { LanceStorage } from './index';

/**
 * Represents a message record in the storage system
 */
interface MessageRecord {
  id: number;
  threadId: string;
  referenceId: number;
  messageType: string;
  content: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Generates an array of random records for testing purposes
 * @param count - Number of records to generate
 * @returns Array of message records with random values
 */
function generateRecords(count: number): MessageRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    threadId: `12333d567-e89b-12d3-a456-${(426614174000 + index).toString()}`,
    referenceId: index + 1,
    messageType: 'text',
    content: `Test message ${index + 1}`,
    createdAt: new Date(),
    metadata: { testIndex: index, foo: 'bar' },
  }));
}

function generateMessageRecords(count: number, threadId?: string): MessageType[] {
  return Array.from({ length: count }, (_, index) => ({
    id: (index + 1).toString(),
    content: `Test message ${index + 1}`,
    role: 'user',
    createdAt: new Date(),
    threadId: threadId ?? `12333d567-e89b-12d3-a456-${(426614174000 + index).toString()}`,
    resourceId: `12333d567-e89b-12d3-a456-${(426614174000 + index).toString()}`,
    toolCallIds: [],
    toolCallArgs: [],
    toolNames: [],
    type: 'text',
  }));
}

describe('LanceStorage tests', async () => {
  let storage!: LanceStorage;

  beforeAll(async () => {
    storage = await LanceStorage.create('test', 'lancedb-storage');
  });

  it('should create a new instance of LanceStorage', async () => {
    const storage = await LanceStorage.create('test', 'lancedb-storage');
    expect(storage).toBeInstanceOf(LanceStorage);
    expect(storage.name).toBe('test');
  });

  describe('Create table', () => {
    beforeAll(async () => {
      // Clean up any existing tables
      try {
        await storage.dropTable(TABLE_MESSAGES);
      } catch {
        // Ignore if table doesn't exist
      }
    });

    afterAll(async () => {
      await storage.dropTable(TABLE_MESSAGES);
    });

    it('should create an empty table with given schema', async () => {
      const schema: Record<string, StorageColumn> = {
        id: { type: 'integer', nullable: false },
        threadId: { type: 'uuid', nullable: false },
        referenceId: { type: 'bigint', nullable: true },
        messageType: { type: 'text', nullable: true },
        content: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: true },
        metadata: { type: 'jsonb', nullable: true },
      };

      await storage.createTable({ tableName: TABLE_MESSAGES, schema });

      // Verify table exists and schema is correct
      const table = await storage.getTableSchema(TABLE_MESSAGES);

      expect(table.fields.length).toBe(7);
      expect(table.names).toEqual(
        expect.arrayContaining(['id', 'threadId', 'referenceId', 'messageType', 'content', 'createdAt', 'metadata']),
      );
      // check the types of the fields
      expect(table.fields[0].type.toString().toLowerCase()).toBe('int32');
      expect(table.fields[1].type.toString().toLowerCase()).toBe('utf8');
      expect(table.fields[2].type.toString().toLowerCase()).toBe('int64');
      expect(table.fields[3].type.toString().toLowerCase()).toBe('utf8');
      expect(table.fields[4].type.toString().toLowerCase()).toBe('utf8');
      expect(table.fields[5].type.toString().toLowerCase()).toBe('float64');
      expect(table.fields[6].type.toString().toLowerCase()).toBe('utf8');
    });
  });

  describe('Insert data', () => {
    beforeAll(async () => {
      const schema: Record<string, StorageColumn> = {
        id: { type: 'integer', nullable: false },
        threadId: { type: 'uuid', nullable: false },
        referenceId: { type: 'bigint', nullable: true },
        messageType: { type: 'text', nullable: true },
        content: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: true },
        metadata: { type: 'jsonb', nullable: true },
      };

      await storage.createTable({ tableName: TABLE_MESSAGES, schema });
    });

    afterAll(async () => {
      await storage.dropTable(TABLE_MESSAGES);
    });

    it('should insert a single record without throwing exceptions', async () => {
      const record = {
        id: 1,
        threadId: '123e4567-e89b-12d3-a456-426614174000',
        referenceId: 1,
        messageType: 'text',
        content: 'Hello, world!',
        createdAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.insert({ tableName: TABLE_MESSAGES, record });

      // Verify the record was inserted
      const loadedRecord = await storage.load({ tableName: TABLE_MESSAGES, keys: { id: 1 } });

      // Custom comparison to handle date precision differences
      expect(loadedRecord.id).toEqual(record.id);
      expect(loadedRecord.threadId).toEqual(record.threadId);
      expect(loadedRecord.referenceId).toEqual(record.referenceId);
      expect(loadedRecord.messageType).toEqual(record.messageType);
      expect(loadedRecord.content).toEqual(record.content);
      expect(loadedRecord.metadata).toEqual(record.metadata);

      // Compare dates ignoring millisecond precision
      const loadedDate = new Date(loadedRecord.createdAt);
      const originalDate = new Date(record.createdAt);
      expect(loadedDate.getFullYear()).toEqual(originalDate.getFullYear());
      expect(loadedDate.getMonth()).toEqual(originalDate.getMonth());
      expect(loadedDate.getDate()).toEqual(originalDate.getDate());
      expect(loadedDate.getHours()).toEqual(originalDate.getHours());
      expect(loadedDate.getMinutes()).toEqual(originalDate.getMinutes());
      expect(loadedDate.getSeconds()).toEqual(originalDate.getSeconds());
    });

    it('should throw error when invalid key type is provided', async () => {
      await expect(storage.load({ tableName: TABLE_MESSAGES, keys: { id: '1' } })).rejects.toThrowError(
        "Failed to load record: Error: Expected numeric value for field 'id', got string",
      );
    });

    it('should insert batch records without throwing exceptions', async () => {
      const recordCount = 100;
      const records: MessageRecord[] = generateRecords(recordCount);

      await storage.batchInsert({ tableName: TABLE_MESSAGES, records });

      // Verify records were inserted
      const loadedRecords = await storage.load({ tableName: TABLE_MESSAGES, keys: { id: 1 } });
      expect(loadedRecords).not.toBeNull();
      expect(loadedRecords.id).toEqual(records[0].id);
      expect(loadedRecords.threadId).toEqual(records[0].threadId);
      expect(loadedRecords.referenceId).toEqual(records[0].referenceId);
      expect(loadedRecords.messageType).toEqual(records[0].messageType);
      expect(loadedRecords.content).toEqual(records[0].content);
      expect(new Date(loadedRecords.createdAt)).toEqual(new Date(records[0].createdAt));
      expect(loadedRecords.metadata).toEqual(records[0].metadata);

      // Verify the last record
      const lastRecord = await storage.load({ tableName: TABLE_MESSAGES, keys: { id: recordCount } });
      expect(lastRecord).not.toBeNull();
      expect(lastRecord.id).toEqual(records[recordCount - 1].id);
      expect(lastRecord.threadId).toEqual(records[recordCount - 1].threadId);
      expect(lastRecord.referenceId).toEqual(records[recordCount - 1].referenceId);
      expect(lastRecord.messageType).toEqual(records[recordCount - 1].messageType);
      expect(lastRecord.content).toEqual(records[recordCount - 1].content);
      expect(new Date(lastRecord.createdAt)).toEqual(new Date(records[recordCount - 1].createdAt));
      expect(lastRecord.metadata).toEqual(records[recordCount - 1].metadata);
    });
  });

  describe('Query data', () => {
    beforeAll(async () => {
      const schema: Record<string, StorageColumn> = {
        id: { type: 'integer', nullable: false },
        threadId: { type: 'uuid', nullable: false },
        referenceId: { type: 'bigint', nullable: true },
        messageType: { type: 'text', nullable: true },
        content: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: true },
        metadata: { type: 'jsonb', nullable: true },
      };

      await storage.createTable({ tableName: TABLE_MESSAGES, schema });
    });

    afterAll(async () => {
      await storage.dropTable(TABLE_MESSAGES);
    });

    it('should query data by one key only', async () => {
      const record = {
        id: 1,
        threadId: '123e4567-e89b-12d3-a456-426614174000',
        referenceId: 1,
        messageType: 'text',
        content: 'Hello, world!',
        createdAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.insert({ tableName: TABLE_MESSAGES, record });

      const loadedRecord = await storage.load({ tableName: TABLE_MESSAGES, keys: { id: 1 } });
      expect(loadedRecord).not.toBeNull();
      expect(loadedRecord.id).toEqual(record.id);
      expect(loadedRecord.threadId).toEqual(record.threadId);
      expect(loadedRecord.referenceId).toEqual(record.referenceId);
      expect(loadedRecord.messageType).toEqual(record.messageType);
      expect(loadedRecord.content).toEqual(record.content);
      expect(new Date(loadedRecord.createdAt)).toEqual(new Date(record.createdAt));
      expect(loadedRecord.metadata).toEqual(record.metadata);
    });

    it('should query data by multiple keys', async () => {
      const record = {
        id: 1,
        threadId: '123e4567-e89b-12d3-a456-426614174000',
        referenceId: 1,
        messageType: 'hi',
        content: 'Hello, world!',
        createdAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.insert({ tableName: TABLE_MESSAGES, record });

      const loadedRecord = await storage.load({
        tableName: TABLE_MESSAGES,
        keys: { id: 1, messageType: 'hi' },
      });

      expect(loadedRecord).not.toBeNull();
      expect(loadedRecord.id).toEqual(record.id);
      expect(loadedRecord.threadId).toEqual(record.threadId);
      expect(loadedRecord.referenceId).toEqual(record.referenceId);
      expect(loadedRecord.messageType).toEqual(record.messageType);
      expect(loadedRecord.content).toEqual(record.content);
      expect(new Date(loadedRecord.createdAt)).toEqual(new Date(record.createdAt));
      expect(loadedRecord.metadata).toEqual(record.metadata);

      const recordsQueriedWithIdAndThreadId = await storage.load({
        tableName: TABLE_MESSAGES,
        keys: { id: 1, threadId: '123e4567-e89b-12d3-a456-426614174000' },
      });

      expect(recordsQueriedWithIdAndThreadId).not.toBeNull();
      expect(recordsQueriedWithIdAndThreadId.id).toEqual(record.id);
      expect(recordsQueriedWithIdAndThreadId.threadId).toEqual(record.threadId);
      expect(recordsQueriedWithIdAndThreadId.referenceId).toEqual(record.referenceId);
      expect(recordsQueriedWithIdAndThreadId.messageType).toEqual(record.messageType);
      expect(recordsQueriedWithIdAndThreadId.content).toEqual(record.content);
      expect(new Date(recordsQueriedWithIdAndThreadId.createdAt)).toEqual(new Date(record.createdAt));
      expect(recordsQueriedWithIdAndThreadId.metadata).toEqual(record.metadata);
    });
  });

  describe('Thread operations', () => {
    beforeAll(async () => {
      const threadTableSchema: Record<string, StorageColumn> = {
        id: { type: 'uuid', nullable: false },
        resourceId: { type: 'uuid', nullable: false },
        title: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: true },
        updatedAt: { type: 'timestamp', nullable: true },
        metadata: { type: 'jsonb', nullable: true },
      };

      await storage.createTable({ tableName: TABLE_THREADS, schema: threadTableSchema });
    });

    afterAll(async () => {
      await storage.dropTable(TABLE_THREADS);
    });

    beforeEach(async () => {
      await storage.clearTable({ tableName: TABLE_THREADS });
    });

    it('should get thread by ID', async () => {
      const thread = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        resourceId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.insert({ tableName: TABLE_THREADS, record: thread });

      const loadedThread = (await storage.getThreadById({ threadId: thread.id })) as StorageThreadType;
      expect(loadedThread).not.toBeNull();
      expect(loadedThread?.id).toEqual(thread.id);
      expect(loadedThread?.resourceId).toEqual(thread.resourceId);
      expect(loadedThread?.title).toEqual(thread.title);
      expect(new Date(loadedThread?.createdAt)).toEqual(new Date(thread.createdAt));
      expect(new Date(loadedThread?.updatedAt)).toEqual(new Date(thread.updatedAt));
      expect(loadedThread?.metadata).toEqual(thread.metadata);
    });

    it('should save thread', async () => {
      const thread = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        resourceId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.saveThread({ thread });

      const loadedThread = (await storage.getThreadById({ threadId: thread.id })) as StorageThreadType;
      expect(loadedThread).not.toBeNull();
      expect(loadedThread?.id).toEqual(thread.id);
      expect(loadedThread?.resourceId).toEqual(thread.resourceId);
      expect(loadedThread?.title).toEqual(thread.title);
      expect(new Date(loadedThread?.createdAt)).toEqual(new Date(thread.createdAt));
      expect(new Date(loadedThread?.updatedAt)).toEqual(new Date(thread.updatedAt));
      expect(loadedThread?.metadata).toEqual(thread.metadata);
    });

    it('should get threads by resource ID', async () => {
      const resourceId = '123e4567-e89b-12d3-a456-426614174000';
      const thread1 = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        resourceId,
        title: 'Test Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { foo: 'bar' },
      };

      const thread2 = {
        id: '123e4567-e89b-12d3-a456-426614174001',
        resourceId,
        title: 'Test Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.saveThread({ thread: thread1 });
      await storage.saveThread({ thread: thread2 });

      const loadedThreads = await storage.getThreadsByResourceId({ resourceId });

      expect(loadedThreads).not.toBeNull();
      expect(loadedThreads.length).toEqual(2);

      expect(loadedThreads[0].id).toEqual(thread1.id);
      expect(loadedThreads[0].resourceId).toEqual(resourceId);
      expect(loadedThreads[0].title).toEqual(thread1.title);
      expect(new Date(loadedThreads[0].createdAt)).toEqual(new Date(thread1.createdAt));
      expect(new Date(loadedThreads[0].updatedAt)).toEqual(new Date(thread1.updatedAt));
      expect(loadedThreads[0].metadata).toEqual(thread1.metadata);

      expect(loadedThreads[1].id).toEqual(thread2.id);
      expect(loadedThreads[1].resourceId).toEqual(resourceId);
      expect(loadedThreads[1].title).toEqual(thread2.title);
      expect(new Date(loadedThreads[1].createdAt)).toEqual(new Date(thread2.createdAt));
      expect(new Date(loadedThreads[1].updatedAt)).toEqual(new Date(thread2.updatedAt));
      expect(loadedThreads[1].metadata).toEqual(thread2.metadata);
    });

    it('should update thread', async () => {
      const thread = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        resourceId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.saveThread({ thread });

      const updatedThread = await storage.updateThread({
        id: thread.id,
        title: 'Updated Thread',
        metadata: { foo: 'hi' },
      });

      expect(updatedThread).not.toBeNull();
      expect(updatedThread.id).toEqual(thread.id);
      expect(updatedThread.title).toEqual('Updated Thread');
      expect(updatedThread.metadata).toEqual({ foo: 'hi' });
    });

    it('should delete thread', async () => {
      await storage.dropTable(TABLE_THREADS);
      // create new table
      const threadTableSchema: Record<string, StorageColumn> = {
        id: { type: 'uuid', nullable: false },
        resourceId: { type: 'uuid', nullable: false },
        title: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: true },
        updatedAt: { type: 'timestamp', nullable: true },
        metadata: { type: 'jsonb', nullable: true },
      };

      await storage.createTable({ tableName: TABLE_THREADS, schema: threadTableSchema });

      const thread = {
        id: '123e4567-e89b-12d3-a456-426614174023',
        resourceId: '123e4567-e89b-12d3-a456-426614234020',
        title: 'Test Thread',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { foo: 'bar' },
      } as StorageThreadType;

      await storage.saveThread({ thread });

      await storage.deleteThread({ threadId: thread.id });

      const loadedThread = await storage.getThreadById({ threadId: thread.id });
      expect(loadedThread).toBeNull();
    });
  });

  describe('Message operations', () => {
    beforeAll(async () => {
      const messageTableSchema: Record<string, StorageColumn> = {
        id: { type: 'uuid', nullable: false },
        content: { type: 'text', nullable: true },
        role: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: false },
        threadId: { type: 'uuid', nullable: false },
        resourceId: { type: 'uuid', nullable: true },
        toolCallIds: { type: 'text', nullable: true },
        toolCallArgs: { type: 'jsonb', nullable: true },
        toolNames: { type: 'text', nullable: true },
        type: { type: 'text', nullable: true },
      };

      await storage.createTable({ tableName: TABLE_MESSAGES, schema: messageTableSchema });
    });

    afterAll(async () => {
      await storage.dropTable(TABLE_MESSAGES);
    });

    afterEach(async () => {
      await storage.clearTable({ tableName: TABLE_MESSAGES });
    });

    it('should save messages without error', async () => {
      const messages: MessageType[] = generateMessageRecords(10);
      expect(async () => {
        await storage.saveMessages({ messages });
      }).not.toThrow();
    });

    it('should get messages by thread ID', async () => {
      const threadId = '12333d567-e89b-12d3-a456-426614174000';
      const messages: MessageType[] = generateMessageRecords(10, threadId);
      await storage.saveMessages({ messages });
      const loadedMessages = await storage.getMessages({ threadId });

      expect(loadedMessages).not.toBeNull();
      expect(loadedMessages.length).toEqual(10);

      loadedMessages.forEach((message, index) => {
        expect(message.threadId).toEqual(threadId);
        expect(message.id.toString()).toEqual(messages[index].id);
        expect(message.content).toEqual(messages[index].content);
        expect(new Date(message.createdAt)).toEqual(new Date(messages[index].createdAt));
        expect(message.role).toEqual(messages[index].role);
        expect(message.resourceId).toEqual(messages[index].resourceId);
        expect(message.toolCallIds).toEqual('');
        expect(message.toolCallArgs).toEqual('');
        expect(message.toolNames).toEqual('');
        expect(message.type).toEqual(messages[index].type);
      });
    });

    it('should get the last N messages when selectBy.last is specified', async () => {
      const threadId = '12333d567-e89b-12d3-a456-426614174000';
      const messages: MessageType[] = generateMessageRecords(10, threadId);
      await storage.saveMessages({ messages });

      // Get the last 3 messages
      const loadedMessages = await storage.getMessages({
        threadId,
        selectBy: { last: 3 },
      });

      expect(loadedMessages).not.toBeNull();
      expect(loadedMessages.length).toEqual(3);
      console.log('last three', loadedMessages);

      // Verify that we got the last 3 messages in chronological order
      for (let i = 0; i < 3; i++) {
        expect(loadedMessages[i].id.toString()).toEqual(messages[messages.length - 3 + i].id);
        expect(loadedMessages[i].content).toEqual(messages[messages.length - 3 + i].content);
      }
    });

    it('should get specific messages when selectBy.include is specified', async () => {
      const threadId = '12333d567-e89b-12d3-a456-426614174000';
      const messages: MessageType[] = generateMessageRecords(10, threadId);
      await storage.saveMessages({ messages });

      // Select specific messages by ID
      const messageIds = [messages[2].id, messages[5].id, messages[8].id];
      const loadedMessages = await storage.getMessages({
        threadId,
        selectBy: {
          include: messageIds.map(id => ({ id })),
        },
      });

      expect(loadedMessages).not.toBeNull();
      // We should get either the specified messages or all thread messages
      expect(loadedMessages.length).toBeGreaterThanOrEqual(3);

      // Verify that the selected messages are included in the results
      const loadedIds = loadedMessages.map(m => m.id.toString());
      messageIds.forEach(id => {
        expect(loadedIds).toContain(id);
      });
    });

    it('should handle empty results when using selectBy filters', async () => {
      const threadId = '12333d567-e89b-12d3-a456-426614174000';
      // Create messages for a different thread ID
      const messages: MessageType[] = generateMessageRecords(5, 'different-thread-id');
      await storage.saveMessages({ messages });

      // Try to get messages for our test threadId, which should return empty
      const loadedMessages = await storage.getMessages({
        threadId,
        selectBy: { last: 3 },
      });

      expect(loadedMessages).not.toBeNull();
      expect(loadedMessages.length).toEqual(0);
    });

    it('should throw error when threadConfig is provided', async () => {
      const threadId = '12333d567-e89b-12d3-a456-426614174000';
      const messages: MessageType[] = generateMessageRecords(5, threadId);
      await storage.saveMessages({ messages });

      // Test that providing a threadConfig throws an error
      await expect(
        storage.getMessages({
          threadId,
          threadConfig: {
            lastMessages: 10,
            semanticRecall: {
              topK: 5,
              messageRange: { before: 3, after: 3 },
            },
            workingMemory: {
              enabled: true,
            },
            threads: {
              generateTitle: true,
            },
          },
        }),
      ).rejects.toThrow('ThreadConfig is not supported by LanceDB storage');
    });

    it('should retrieve messages with context using withPreviousMessages and withNextMessages', async () => {
      const threadId = '12333d567-e89b-12d3-a456-426614174000';
      const messages: MessageType[] = generateMessageRecords(10, threadId);
      await storage.saveMessages({ messages });

      // Get a specific message with context (previous and next messages)
      const targetMessageId = messages[5].id;
      const loadedMessages = await storage.getMessages({
        threadId,
        selectBy: {
          include: [
            {
              id: targetMessageId,
              withPreviousMessages: 2,
              withNextMessages: 1,
            },
          ],
        },
      });

      expect(loadedMessages).not.toBeNull();

      // We should get the target message plus 2 previous and 1 next message
      // So a total of 4 messages (the target message, 2 before, and 1 after)
      expect(loadedMessages.length).toEqual(4);

      // Extract the IDs from the results for easier checking
      const loadedIds = loadedMessages.map(m => m.id.toString());

      // Check that the target message is included
      expect(loadedIds).toContain(targetMessageId);

      // Check that the previous 2 messages are included (messages[3] and messages[4])
      expect(loadedIds).toContain(messages[3].id);
      expect(loadedIds).toContain(messages[4].id);

      // Check that the next message is included (messages[6])
      expect(loadedIds).toContain(messages[6].id);

      // Verify correct chronological order
      for (let i = 0; i < loadedMessages.length - 1; i++) {
        const currentDate = new Date(loadedMessages[i].createdAt).getTime();
        const nextDate = new Date(loadedMessages[i + 1].createdAt).getTime();
        expect(currentDate).toBeLessThanOrEqual(nextDate);
      }
    });
  });

  describe('Trace operations', () => {
    beforeAll(async () => {
      const traceTableSchema = TABLE_SCHEMAS[TABLE_TRACES];
      await storage.createTable({ tableName: TABLE_TRACES, schema: traceTableSchema });
    });

    afterAll(async () => {
      await storage.dropTable(TABLE_TRACES);
    });

    afterEach(async () => {
      await storage.clearTable({ tableName: TABLE_TRACES });
    });

    it('should save trace', async () => {
      const trace = {
        id: '123e4567-e89b-12d3-a456-426614174023',
        parentSpanId: '123e4567-e89b-12d3-a456-426614174023',
        name: 'Test Trace',
        traceId: '123e4567-e89b-12d3-a456-426614234020',
        scope: 'test',
        kind: 0,
        attributes: { attribute1: 'value1' },
        status: { code: 0, description: 'OK' },
        events: { event1: 'value1' },
        links: { link1: 'value1' },
        other: { other1: 'value1' },
        startTime: new Date().getTime(),
        endTime: new Date().getTime(),
        createdAt: new Date(),
      } as TraceType;

      await storage.saveTrace({ trace });

      const loadedTrace = await storage.getTraceById({ traceId: trace.id });
      console.log(loadedTrace);

      expect(loadedTrace).not.toBeNull();
      expect(loadedTrace.id).toEqual(trace.id);
      expect(loadedTrace.name).toEqual('Test Trace');
      expect(loadedTrace.parentSpanId).toEqual(trace.parentSpanId);
      expect(loadedTrace.traceId).toEqual(trace.traceId);
      expect(loadedTrace.scope).toEqual(trace.scope);
      expect(loadedTrace.kind).toEqual(trace.kind);
      expect(loadedTrace.attributes).toEqual(trace.attributes);
      expect(loadedTrace.status).toEqual(trace.status);
      expect(loadedTrace.events).toEqual(trace.events);
      expect(loadedTrace.links).toEqual(trace.links);
      expect(loadedTrace.other).toEqual(trace.other);
      expect(loadedTrace.startTime).toEqual(trace.startTime);
      expect(loadedTrace.endTime).toEqual(trace.endTime);
      expect(new Date(loadedTrace.createdAt)).toEqual(trace.createdAt);
    });
  });
});
