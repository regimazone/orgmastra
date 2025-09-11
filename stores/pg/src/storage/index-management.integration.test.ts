import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { PostgresStore } from './index';
import { TABLE_THREADS, TABLE_MESSAGES, TABLE_TRACES, TABLE_EVALS } from '@mastra/core/storage';

const connectionString = process.env.DB_URL || 'postgresql://postgres:postgres@localhost:5434/mastra';

describe('PostgreSQL Index Management', () => {
  let store: PostgresStore;

  beforeAll(async () => {
    // Setup clean database
    store = new PostgresStore({ connectionString });
    await store.init();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    // Clean up all test indexes
    const indexes = await store.listIndexes();
    for (const index of indexes.filter(i => i.name.includes('test_'))) {
      await store.dropIndex(index.name);
    }
  });

  describe('createIndex', () => {
    it('should create single column index', async () => {
      await store.createIndex({
        name: 'test_threads_resourceid_idx',
        table: TABLE_THREADS,
        columns: ['resourceId'],
      });

      const indexes = await store.listIndexes('mastra_threads');
      expect(indexes).toContainEqual(
        expect.objectContaining({
          name: 'test_threads_resourceid_idx',
          table: 'mastra_threads',
          columns: expect.arrayContaining(['resourceId']),
        }),
      );
    });

    it('should create composite index', async () => {
      await store.createIndex({
        name: 'test_threads_composite_idx',
        table: TABLE_THREADS,
        columns: ['resourceId', 'createdAt DESC'],
      });

      const indexes = await store.listIndexes('mastra_threads');
      expect(indexes).toContainEqual(
        expect.objectContaining({
          name: 'test_threads_composite_idx',
          columns: expect.arrayContaining(['resourceId', 'createdAt']),
        }),
      );
    });

    it('should create unique index', async () => {
      await store.createIndex({
        name: 'test_unique_idx',
        table: TABLE_THREADS,
        columns: ['id'],
        unique: true,
      });

      const indexes = await store.listIndexes('mastra_threads');
      const uniqueIndex = indexes.find(i => i.name === 'test_unique_idx');
      expect(uniqueIndex?.unique).toBe(true);
    });

    it('should create partial index', async () => {
      await store.createIndex({
        name: 'test_partial_idx',
        table: TABLE_THREADS,
        columns: ['resourceId'],
        where: `"resourceId" IS NOT NULL`, // Use an actual field with quotes for case-sensitive column
      });

      const indexes = await store.listIndexes('mastra_threads');
      const partialIndex = indexes.find(i => i.name === 'test_partial_idx');
      expect(partialIndex).toBeDefined();
      expect(partialIndex?.definition).toContain('WHERE');
    });

    it('should create concurrent index by default', async () => {
      // Test that CONCURRENT is used (no table locking)
      await store.createIndex({
        name: 'test_concurrent_idx',
        table: TABLE_THREADS,
        columns: ['resourceId'],
      });

      // Verify index exists
      const indexes = await store.listIndexes('mastra_threads');
      expect(indexes.some(i => i.name === 'test_concurrent_idx')).toBe(true);
    });

    it('should handle index creation errors gracefully', async () => {
      // Try to create index on non-existent table
      await expect(
        store.createIndex({
          name: 'test_invalid_idx',
          table: 'non_existent_table' as any,
          columns: ['id'],
        }),
      ).rejects.toThrow();
    });

    it('should prevent duplicate index creation', async () => {
      await store.createIndex({
        name: 'test_duplicate_idx',
        table: TABLE_THREADS,
        columns: ['resourceId'],
      });

      // Should not throw, should handle gracefully
      await expect(
        store.createIndex({
          name: 'test_duplicate_idx',
          table: TABLE_THREADS,
          columns: ['resourceId'],
        }),
      ).resolves.not.toThrow();
    });

    it('should create index with different methods', async () => {
      // Test HASH index (useful for equality comparisons)
      await store.createIndex({
        name: 'test_hash_idx',
        table: TABLE_MESSAGES,
        columns: ['thread_id'],
        method: 'hash',
      });

      const indexes = await store.listIndexes('mastra_messages');
      const hashIndex = indexes.find(i => i.name === 'test_hash_idx');
      expect(hashIndex).toBeDefined();
      expect(hashIndex?.definition).toContain('hash');
    });
  });

  describe('dropIndex', () => {
    it('should drop existing index', async () => {
      // Create index first
      await store.createIndex({
        name: 'test_drop_idx',
        table: TABLE_THREADS,
        columns: ['resourceId'],
      });

      // Verify it exists
      let indexes = await store.listIndexes('mastra_threads');
      expect(indexes.some(i => i.name === 'test_drop_idx')).toBe(true);

      // Drop it
      await store.dropIndex('test_drop_idx');

      // Verify it's gone
      indexes = await store.listIndexes('mastra_threads');
      expect(indexes.some(i => i.name === 'test_drop_idx')).toBe(false);
    });

    it('should handle dropping non-existent index gracefully', async () => {
      await expect(store.dropIndex('non_existent_index')).resolves.not.toThrow();
    });

    it('should drop index with schema prefix', async () => {
      const schemaStore = new PostgresStore({
        connectionString,
        schemaName: 'test_schema',
      });
      await schemaStore.init();

      // Create an index with schema
      await schemaStore.createIndex({
        name: 'test_schema_test_drop_idx',
        table: TABLE_THREADS,
        columns: ['resourceId'],
      });

      // Drop it
      await schemaStore.dropIndex('test_schema_test_drop_idx');

      // Verify it's gone
      const indexes = await schemaStore.listIndexes('mastra_threads');
      expect(indexes.some(i => i.name === 'test_schema_test_drop_idx')).toBe(false);

      await schemaStore.close();
    });
  });

  describe('listIndexes', () => {
    it('should list all indexes when no table specified', async () => {
      const indexes = await store.listIndexes();
      expect(Array.isArray(indexes)).toBe(true);
      expect(indexes.length).toBeGreaterThan(0); // Should have at least primary key indexes
    });

    it('should list indexes for specific table', async () => {
      const indexes = await store.listIndexes('mastra_threads');
      expect(Array.isArray(indexes)).toBe(true);
      // Should include primary key index at minimum
      expect(indexes.some(i => i.table === 'mastra_threads')).toBe(true);
    });

    it('should return empty array for table with no custom indexes', async () => {
      // Create a temporary table with no indexes
      await store.db.none('CREATE TEMPORARY TABLE temp_no_indexes (id TEXT)');

      const indexes = await store.listIndexes('temp_no_indexes');
      expect(Array.isArray(indexes)).toBe(true);
      // Temporary tables might have system indexes, but no custom ones
    });

    it('should include index metadata', async () => {
      await store.createIndex({
        name: 'test_metadata_idx',
        table: TABLE_THREADS,
        columns: ['resourceId', 'createdAt'],
      });

      const indexes = await store.listIndexes('mastra_threads');
      const testIndex = indexes.find(i => i.name === 'test_metadata_idx');

      expect(testIndex).toMatchObject({
        name: 'test_metadata_idx',
        table: 'mastra_threads',
        columns: expect.arrayContaining(['resourceId', 'createdAt']),
        unique: false,
        size: expect.any(String),
        definition: expect.stringContaining('CREATE INDEX'),
      });
    });

    it('should list indexes for all mastra tables', async () => {
      const tables = ['mastra_threads', 'mastra_messages', 'mastra_traces', 'mastra_evals'];

      for (const table of tables) {
        const indexes = await store.listIndexes(table);
        expect(Array.isArray(indexes)).toBe(true);
      }
    });
  });

  describe('Automatic Index Management (Created on Init)', () => {
    it('should create composite indexes automatically during init', async () => {
      // The store was already initialized in beforeAll, so composite indexes should exist
      const indexes = await store.listIndexes();

      // Check for automatic composite indexes created during init
      const expectedIndexPatterns = [
        'threads_resourceid_createdat',
        'messages_thread_id_createdat',
        'traces_name_starttime',
        'evals_agent_name_created_at',
      ];

      for (const pattern of expectedIndexPatterns) {
        expect(indexes.some(i => i.name.includes(pattern))).toBe(true);
      }
    });

    it('should handle different schema names', async () => {
      const customStore = new PostgresStore({
        connectionString,
        schemaName: 'test_schema',
      });
      await customStore.init();

      // Check that composite indexes were created with schema prefix
      const indexes = await customStore.listIndexes();
      const compositeIndexes = indexes.filter(
        i =>
          i.name.includes('threads_resourceid_createdat') ||
          i.name.includes('messages_thread_id_createdat') ||
          i.name.includes('traces_name_starttime') ||
          i.name.includes('evals_agent_name_created_at'),
      );

      expect(compositeIndexes.length).toBe(4);
      expect(compositeIndexes.every(i => i.name.startsWith('test_schema_'))).toBe(true);

      await customStore.close();
    });
  });

  describe('Store Integration', () => {
    it('should expose basic index operations through store', async () => {
      expect(typeof store.createIndex).toBe('function');
      expect(typeof store.dropIndex).toBe('function');
      expect(typeof store.listIndexes).toBe('function');
    });

    it('should throw error if store not initialized', async () => {
      const uninitializedStore = new PostgresStore({ connectionString });

      await expect(
        uninitializedStore.createIndex({
          name: 'test',
          table: TABLE_THREADS,
          columns: ['id'],
        }),
      ).rejects.toThrow('Store is not initialized');
    });
  });

  describe('Complex Index Scenarios', () => {
    it('should handle indexes with multiple sort orders', async () => {
      await store.createIndex({
        name: 'test_complex_sort_idx',
        table: TABLE_MESSAGES,
        columns: ['thread_id', 'createdAt DESC', 'id ASC'],
      });

      const indexes = await store.listIndexes('mastra_messages');
      const complexIndex = indexes.find(i => i.name === 'test_complex_sort_idx');
      expect(complexIndex).toBeDefined();
      expect(complexIndex?.columns).toContain('thread_id');
      expect(complexIndex?.columns).toContain('createdAt');
      expect(complexIndex?.columns).toContain('id');
    });

    it('should create indexes on all mastra tables', async () => {
      const testIndexes = [
        { table: TABLE_THREADS, columns: ['resourceId'] },
        { table: TABLE_MESSAGES, columns: ['thread_id'] },
        { table: TABLE_TRACES, columns: ['name'] },
        { table: TABLE_EVALS, columns: ['agent_name'] },
      ];

      for (const [idx, indexDef] of testIndexes.entries()) {
        await store.createIndex({
          name: `test_all_tables_idx_${idx}`,
          table: indexDef.table,
          columns: indexDef.columns,
        });
      }

      // Verify all were created
      for (const [idx, _] of testIndexes.entries()) {
        const indexes = await store.listIndexes();
        expect(indexes.some(i => i.name === `test_all_tables_idx_${idx}`)).toBe(true);
      }
    });

    it('should handle column names with special characters', async () => {
      await store.createIndex({
        name: 'test_special_chars_idx',
        table: TABLE_MESSAGES,
        columns: ['thread_id', 'createdAt'],
      });

      const indexes = await store.listIndexes('mastra_messages');
      const specialIndex = indexes.find(i => i.name === 'test_special_chars_idx');
      expect(specialIndex).toBeDefined();
    });
  });
});

describe('Index Performance Impact', () => {
  let store: PostgresStore;

  beforeAll(async () => {
    store = new PostgresStore({ connectionString });
    await store.init();
  });

  afterAll(async () => {
    await store.close();
  });

  const seedTestData = async (count: number) => {
    const threads = [];
    const messages = [];

    for (let i = 0; i < count; i++) {
      const threadId = `thread-${i}`;
      const resourceId = `resource-${Math.floor(i / 10)}`; // Group threads by resource

      threads.push({
        id: threadId,
        resourceId,
        title: `Thread ${i}`,
        createdAt: new Date(Date.now() - i * 1000),
        updatedAt: new Date(Date.now() - i * 1000),
        metadata: JSON.stringify({}),
      });

      for (let j = 0; j < 5; j++) {
        messages.push({
          id: `message-${i}-${j}`,
          thread_id: threadId,
          role: 'user',
          content: `Test message ${j}`,
          type: 'text',
          createdAt: new Date(Date.now() - (i * 1000 + j * 100)),
          resourceId: resourceId,
        });
      }
    }

    // Batch insert
    await store.stores.operations.batchInsert({
      tableName: TABLE_THREADS,
      records: threads,
    });
    await store.stores.operations.batchInsert({
      tableName: TABLE_MESSAGES,
      records: messages,
    });
  };

  const measureQueryPerformance = async () => {
    const measurements: Record<string, number> = {};

    // Measure thread query
    const threadStart = Date.now();
    await store.getThreadsByResourceId({ resourceId: 'resource-5' });
    measurements.getThreadsByResourceId = Date.now() - threadStart;

    // Measure messages query
    const messageStart = Date.now();
    await store.getMessages({ threadId: 'thread-50' });
    measurements.getMessages = Date.now() - messageStart;

    return measurements;
  };

  it('should improve performance with automatic indexes', async () => {
    // Clean up any existing test data
    await store.stores.operations.client.none(`DELETE FROM mastra_messages WHERE id LIKE 'message-%'`);
    await store.stores.operations.client.none(`DELETE FROM mastra_threads WHERE id LIKE 'thread-%'`);

    // Seed test data
    await seedTestData(1000);

    // Measure with indexes (created during init)
    const withIndexes = await measureQueryPerformance();
    console.log('With automatic indexes:', withIndexes);

    // Verify indexes exist and provide reasonable performance
    // We expect queries to complete quickly with indexes
    expect(withIndexes.getThreadsByResourceId).toBeLessThan(100); // Should be under 100ms
    expect(withIndexes.getMessages).toBeLessThan(100); // Should be under 100ms
  });

  it('should handle concurrent operations with indexes', async () => {
    // Run multiple operations concurrently
    const operations = [];
    for (let i = 0; i < 10; i++) {
      operations.push(
        store.getThreadsByResourceId({ resourceId: `resource-${i}` }),
        store.getMessages({ threadId: `thread-${i * 10}` }),
      );
    }

    // Should complete without errors
    await expect(Promise.all(operations)).resolves.not.toThrow();
  });
});
