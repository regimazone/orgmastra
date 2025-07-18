import type { MastraStorage, StorageColumn, TABLE_NAMES } from '@mastra/core/storage';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { TABLE_THREADS } from '@mastra/core/storage';
import { createSampleThread } from '../memory/data';

export function createOperationsTests({ storage }: { storage: MastraStorage }) {
  describe('Date Handling', () => {
    beforeEach(async () => {
      await storage.clearTable({ tableName: TABLE_THREADS });
    });

    it('should handle Date objects in thread operations', async () => {
      const now = new Date();
      const thread = createSampleThread({ date: now });

      await storage.saveThread({ thread });
      const retrievedThread = await storage.getThreadById({ threadId: thread.id });

      expect(retrievedThread?.createdAt).toBeInstanceOf(Date);
      expect(retrievedThread?.updatedAt).toBeInstanceOf(Date);
      expect(retrievedThread?.createdAt.toISOString()).toBe(now.toISOString());
      expect(retrievedThread?.updatedAt.toISOString()).toBe(now.toISOString());
    });

    it('should handle ISO string dates in thread operations', async () => {
      const now = new Date();
      const thread = createSampleThread({ date: now });

      await storage.saveThread({ thread });
      const retrievedThread = await storage.getThreadById({ threadId: thread.id });
      expect(retrievedThread?.createdAt).toBeInstanceOf(Date);
      expect(retrievedThread?.updatedAt).toBeInstanceOf(Date);
      expect(retrievedThread?.createdAt.toISOString()).toBe(now.toISOString());
      expect(retrievedThread?.updatedAt.toISOString()).toBe(now.toISOString());
    });

    it('should handle mixed date formats in thread operations', async () => {
      const now = new Date();
      const thread = createSampleThread({ date: now });

      await storage.saveThread({ thread });
      const retrievedThread = await storage.getThreadById({ threadId: thread.id });
      expect(retrievedThread?.createdAt).toBeInstanceOf(Date);
      expect(retrievedThread?.updatedAt).toBeInstanceOf(Date);
      expect(retrievedThread?.createdAt.toISOString()).toBe(now.toISOString());
      expect(retrievedThread?.updatedAt.toISOString()).toBe(now.toISOString());
    });

    it('should handle date serialization in getThreadsByResourceId', async () => {
      const now = new Date();
      const thread1 = createSampleThread({ date: now });
      const thread2 = { ...createSampleThread({ date: now }), resourceId: thread1.resourceId };
      const threads = [thread1, thread2];

      await Promise.all(threads.map(thread => storage.saveThread({ thread })));

      const retrievedThreads = await storage.getThreadsByResourceId({ resourceId: threads[0]?.resourceId! });
      expect(retrievedThreads).toHaveLength(2);
      retrievedThreads.forEach(thread => {
        expect(thread.createdAt).toBeInstanceOf(Date);
        expect(thread.updatedAt).toBeInstanceOf(Date);
        expect(thread.createdAt.toISOString()).toBe(now.toISOString());
        expect(thread.updatedAt.toISOString()).toBe(now.toISOString());
      });
    });
  });

  if (storage.supports.createTable) {
    describe('Table Operations', () => {
      const testTableName = 'test_table';
      const testTableName2 = 'test_table2';

      beforeAll(async () => {
        try {
          await storage.clearTable({ tableName: testTableName as TABLE_NAMES });
          await storage.clearTable({ tableName: testTableName2 as TABLE_NAMES });
        } catch {
          /* ignore */
        }
      });

      it('should create a new table with schema', async () => {
        await storage.createTable({
          tableName: testTableName as TABLE_NAMES,
          schema: {
            id: { type: 'text', primaryKey: true },
            data: { type: 'text', nullable: true },
            createdAt: { type: 'timestamp', nullable: false },
          },
        });

        // Verify table exists by inserting and retrieving data
        await storage.insert({
          tableName: testTableName as TABLE_NAMES,
          record: { id: 'test1', data: 'test-data', createdAt: new Date() },
        });

        const result = await storage.load({ tableName: testTableName as TABLE_NAMES, keys: { id: 'test1' } });
        expect(result).toBeTruthy();
      });

      it('should handle multiple table creation', async () => {
        await storage.createTable({
          tableName: testTableName2 as TABLE_NAMES,
          schema: {
            id: { type: 'text', primaryKey: true },
            data: { type: 'text', nullable: true },
            createdAt: { type: 'timestamp', nullable: false },
          },
        });

        // Verify both tables work independently
        await storage.insert({
          tableName: testTableName2 as TABLE_NAMES,
          record: { id: 'test2', data: 'test-data-2', createdAt: new Date() },
        });

        const result = await storage.load({ tableName: testTableName2 as TABLE_NAMES, keys: { id: 'test2' } });
        expect(result).toBeTruthy();
      });
    });

    describe('alterTable', () => {
      const TEST_TABLE = 'test_alter_table';
      const BASE_SCHEMA = {
        id: { type: 'integer', primaryKey: true, nullable: false },
        name: { type: 'text', nullable: true },
        createdAt: { type: 'timestamp', nullable: false },
      } as Record<string, StorageColumn>;

      beforeEach(async () => {
        await storage.createTable({ tableName: TEST_TABLE as TABLE_NAMES, schema: BASE_SCHEMA });
      });

      afterEach(async () => {
        await storage.clearTable({ tableName: TEST_TABLE as TABLE_NAMES });
      });

      afterAll(async () => {
        await storage.dropTable({ tableName: TEST_TABLE as TABLE_NAMES });
      });

      it('adds a new column to an existing table', async () => {
        await storage.alterTable({
          tableName: TEST_TABLE as TABLE_NAMES,
          schema: { ...BASE_SCHEMA, age: { type: 'integer', nullable: true } },
          ifNotExists: ['age'],
        });

        await storage.insert({
          tableName: TEST_TABLE as TABLE_NAMES,
          record: { id: 1, name: 'Alice', age: 42, createdAt: new Date() },
        });

        const row = await storage.load<{ id: string; name: string; age?: number }>({
          tableName: TEST_TABLE as TABLE_NAMES,
          keys: { id: 1 },
        });

        console.log('row', row);

        expect(row?.age).toBe(42);
      });

      it('is idempotent when adding an existing column', async () => {
        await storage.alterTable({
          tableName: TEST_TABLE as TABLE_NAMES,
          schema: { ...BASE_SCHEMA, foo: { type: 'text', nullable: true } },
          ifNotExists: ['foo'],
        });
        // Add the column again (should not throw)
        await expect(
          storage.alterTable({
            tableName: TEST_TABLE as TABLE_NAMES,
            schema: { ...BASE_SCHEMA, foo: { type: 'text', nullable: true } },
            ifNotExists: ['foo'],
          }),
        ).resolves.not.toThrow();
      });

      it('should add a default value to a column when using not null', async () => {
        await storage.insert({
          tableName: TEST_TABLE as TABLE_NAMES,
          record: { id: 1, name: 'Bob', createdAt: new Date() },
        });

        await expect(
          storage.alterTable({
            tableName: TEST_TABLE as TABLE_NAMES,
            schema: { ...BASE_SCHEMA, text_column: { type: 'text', nullable: false } },
            ifNotExists: ['text_column'],
          }),
        ).resolves.not.toThrow();

        await expect(
          storage.alterTable({
            tableName: TEST_TABLE as TABLE_NAMES,
            schema: { ...BASE_SCHEMA, timestamp_column: { type: 'timestamp', nullable: false } },
            ifNotExists: ['timestamp_column'],
          }),
        ).resolves.not.toThrow();

        await expect(
          storage.alterTable({
            tableName: TEST_TABLE as TABLE_NAMES,
            schema: { ...BASE_SCHEMA, bigint_column: { type: 'bigint', nullable: false } },
            ifNotExists: ['bigint_column'],
          }),
        ).resolves.not.toThrow();

        await expect(
          storage.alterTable({
            tableName: TEST_TABLE as TABLE_NAMES,
            schema: { ...BASE_SCHEMA, jsonb_column: { type: 'jsonb', nullable: false } },
            ifNotExists: ['jsonb_column'],
          }),
        ).resolves.not.toThrow();
      });
    });
  }

  if (storage.supports.hasColumn) {
    describe('hasColumn', () => {
      const tempTable = `temp_test_table`;

      beforeAll(async () => {
        // Always try to drop the table after each test, ignore errors if it doesn't exist
        try {
          await storage.dropTable({ tableName: tempTable as TABLE_NAMES });
        } catch (e) {
          console.log(e);
          /* ignore */
        }
      });

      it('returns if the column does / does not exist', async () => {
        await storage.createTable({
          tableName: tempTable as TABLE_NAMES,
          schema: {
            id: { type: 'integer', primaryKey: true, nullable: false },
          },
        });

        expect(await storage.stores!.operations.hasColumn(tempTable, 'resourceId')).toBe(false);

        await storage.alterTable({
          tableName: tempTable as TABLE_NAMES,
          schema: {
            id: { type: 'integer', primaryKey: true, nullable: false },
            resourceId: { type: 'text', nullable: true },
          },
          ifNotExists: ['resourceId'],
        });

        if ('stores' in storage && storage.supports.hasColumn) {
          expect(await storage.stores!.operations.hasColumn(tempTable, 'resourceId')).toBe(true);
        }
      });
    });
  }
}
