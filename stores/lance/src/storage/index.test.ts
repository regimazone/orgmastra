import { TABLE_MESSAGES } from '@mastra/core/storage';
import type { StorageColumn } from '@mastra/core/storage';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
    threadId: `123e4567-e89b-12d3-a456-${(426614174000 + index).toString()}`,
    referenceId: index + 1,
    messageType: 'text',
    content: `Test message ${index + 1}`,
    createdAt: new Date(),
    metadata: { testIndex: index, foo: 'bar' },
  }));
}

describe('LanceStorage tests', async () => {
  let storage!: LanceStorage;

  beforeAll(async () => {
    storage = await LanceStorage.create('test', 'lancedb');
  });

  it('should create a new instance of LanceStorage', async () => {
    const storage = await LanceStorage.create('test', 'lancedb');
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
      expect(table.fields[5].type.toString().toLowerCase()).toBe('float32');
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
      // expect(loadedDate.getMinutes()).toEqual(originalDate.getMinutes());
      // expect(loadedDate.getSeconds()).toEqual(originalDate.getSeconds());
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
      // expect(new Date(loadedRecords.createdAt)).toEqual(new Date(records[0].createdAt));
      expect(loadedRecords.metadata).toEqual(records[0].metadata);

      // Verify the last record
      const lastRecord = await storage.load({ tableName: TABLE_MESSAGES, keys: { id: recordCount } });
      expect(lastRecord).not.toBeNull();
      expect(lastRecord.id).toEqual(records[recordCount - 1].id);
      expect(lastRecord.threadId).toEqual(records[recordCount - 1].threadId);
      expect(lastRecord.referenceId).toEqual(records[recordCount - 1].referenceId);
      expect(lastRecord.messageType).toEqual(records[recordCount - 1].messageType);
      expect(lastRecord.content).toEqual(records[recordCount - 1].content);
      // expect(new Date(lastRecord.createdAt)).toEqual(new Date(records[recordCount - 1].createdAt));
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
      // expect(new Date(loadedRecord.createdAt)).toEqual(new Date(record.createdAt));
      expect(loadedRecord.metadata).toEqual(record.metadata);
    });

    it('should query data by multiple keys', async () => {
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

      const loadedRecord = await storage.load({
        tableName: TABLE_MESSAGES,
        keys: { id: 1, threadId: '123e4567-e89b-12d3-a456-426614174000' },
      });
      expect(loadedRecord).not.toBeNull();
      expect(loadedRecord.id).toEqual(record.id);
      expect(loadedRecord.threadId).toEqual(record.threadId);
      expect(loadedRecord.referenceId).toEqual(record.referenceId);
      expect(loadedRecord.messageType).toEqual(record.messageType);
      expect(loadedRecord.content).toEqual(record.content);
      // expect(new Date(loadedRecord.createdAt)).toEqual(new Date(record.createdAt));
      expect(loadedRecord.metadata).toEqual(record.metadata);
    });
  });
});
