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
  number: number;
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
    number: index + 1,
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
        number: { type: 'bigint', nullable: true },
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
        expect.arrayContaining(['id', 'threadId', 'number', 'messageType', 'content', 'createdAt', 'metadata']),
      );
    });
  });

  describe('Insert data', () => {
    beforeAll(async () => {
      const schema: Record<string, StorageColumn> = {
        id: { type: 'integer', nullable: false },
        threadId: { type: 'uuid', nullable: false },
        number: { type: 'bigint', nullable: true },
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
        number: 1,
        messageType: 'text',
        content: 'Hello, world!',
        createdAt: new Date(),
        metadata: { foo: 'bar' },
      };

      await storage.insert({ tableName: TABLE_MESSAGES, record });

      // Verify the record was inserted
      const loadedRecord = await storage.load({ tableName: TABLE_MESSAGES, keys: { id: 1 } });
      console.log(loadedRecord);

      // Custom comparison to handle date precision differences
      expect(loadedRecord.id).toEqual(record.id);
      expect(loadedRecord.threadId).toEqual(record.threadId);
      expect(loadedRecord.number).toEqual(record.number);
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

    it('should insert batch records', async () => {
      const recordCount = 100;
      const records: MessageRecord[] = generateRecords(recordCount);

      expect(async () => {
        await storage.batchInsert({ tableName: TABLE_MESSAGES, records });
      }).not.toThrow();
    });
  });
});
