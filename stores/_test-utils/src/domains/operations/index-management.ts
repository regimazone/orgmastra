import type { MastraStorage } from '@mastra/core/storage';
import { TABLE_THREADS, TABLE_MESSAGES, TABLE_TRACES, TABLE_EVALS } from '@mastra/core/storage';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

export function createIndexManagementTests({ storage }: { storage: MastraStorage }) {
  if (storage.supports.indexManagement) {
    describe('Index Management', () => {
      // Use timestamp to ensure unique index names across test runs
      const timestamp = Date.now();
      const testIndexPrefix = `test_idx_${timestamp}`;
      let createdIndexes: string[] = [];

      afterEach(async () => {
        // Clean up any indexes created during tests
        try {
          const allIndexes = await storage.listIndexes();
          const testIndexes = allIndexes.filter(i => i.name.includes(testIndexPrefix));

          for (const index of testIndexes) {
            try {
              await storage.dropIndex(index.name);
            } catch (error) {
              console.warn(`Failed to drop test index ${index.name}:`, error);
            }
          }
        } catch (error) {
          console.warn('Error during index cleanup:', error);
        }
        createdIndexes = [];
      });

      describe('createIndex', () => {
        it('should create single column index', async () => {
          const indexName = `${testIndexPrefix}_single`;
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['resourceId'],
          });
          createdIndexes.push(indexName);

          const indexes = await storage.listIndexes('mastra_threads');
          const createdIndex = indexes.find(i => i.name === indexName);
          expect(createdIndex).toBeDefined();
          expect(createdIndex?.columns).toContain('resourceId');
        });

        it('should create composite index', async () => {
          const indexName = `${testIndexPrefix}_composite`;
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['resourceId', 'createdAt DESC'],
          });
          createdIndexes.push(indexName);

          const indexes = await storage.listIndexes('mastra_threads');
          const createdIndex = indexes.find(i => i.name === indexName);
          expect(createdIndex).toBeDefined();
          expect(createdIndex?.columns).toContain('resourceId');
          expect(createdIndex?.columns).toContain('createdAt');
        });

        it('should create unique index', async () => {
          const indexName = `${testIndexPrefix}_unique`;
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['id'],
            unique: true,
          });
          createdIndexes.push(indexName);

          const indexes = await storage.listIndexes('mastra_threads');
          const createdIndex = indexes.find(i => i.name === indexName);
          expect(createdIndex).toBeDefined();
          expect(createdIndex?.unique).toBe(true);
        });

        it('should handle index creation errors gracefully', async () => {
          // Try to create index on non-existent table
          await expect(
            storage.createIndex({
              name: `${testIndexPrefix}_invalid`,
              table: 'non_existent_table' as any,
              columns: ['id'],
            }),
          ).rejects.toThrow();
        });

        it('should prevent duplicate index creation', async () => {
          const indexName = `${testIndexPrefix}_duplicate`;
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['resourceId'],
          });
          createdIndexes.push(indexName);

          // Should not throw, should handle gracefully
          await expect(
            storage.createIndex({
              name: indexName,
              table: TABLE_THREADS,
              columns: ['resourceId'],
            }),
          ).resolves.not.toThrow();
        });

        it('should create indexes on different tables', async () => {
          const testIndexes = [
            { name: `${testIndexPrefix}_threads`, table: TABLE_THREADS, columns: ['resourceId'] },
            { name: `${testIndexPrefix}_messages`, table: TABLE_MESSAGES, columns: ['thread_id'] },
            { name: `${testIndexPrefix}_traces`, table: TABLE_TRACES, columns: ['name'] },
            { name: `${testIndexPrefix}_evals`, table: TABLE_EVALS, columns: ['agent_name'] },
          ];

          for (const indexDef of testIndexes) {
            await storage.createIndex(indexDef);
            createdIndexes.push(indexDef.name);
          }

          // Verify all were created
          const allIndexes = await storage.listIndexes();
          for (const indexDef of testIndexes) {
            expect(allIndexes.some(i => i.name === indexDef.name)).toBe(true);
          }
        });
      });

      describe('dropIndex', () => {
        it('should drop existing index', async () => {
          const indexName = `${testIndexPrefix}_to_drop`;

          // Create index first
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['resourceId'],
          });

          // Verify it exists
          let indexes = await storage.listIndexes('mastra_threads');
          expect(indexes.some(i => i.name === indexName)).toBe(true);

          // Drop it
          await storage.dropIndex(indexName);

          // Verify it's gone
          indexes = await storage.listIndexes('mastra_threads');
          expect(indexes.some(i => i.name === indexName)).toBe(false);
        });

        it('should handle dropping non-existent index gracefully', async () => {
          await expect(storage.dropIndex(`${testIndexPrefix}_non_existent`)).resolves.not.toThrow();
        });
      });

      describe('listIndexes', () => {
        beforeEach(async () => {
          // Create a test index for listing tests
          const indexName = `${testIndexPrefix}_for_list`;
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['resourceId', 'createdAt'],
          });
          createdIndexes.push(indexName);
        });

        it('should list all indexes when no table specified', async () => {
          const indexes = await storage.listIndexes();
          expect(Array.isArray(indexes)).toBe(true);
          expect(indexes.length).toBeGreaterThan(0);

          // Should include our test index
          expect(indexes.some(i => i.name === `${testIndexPrefix}_for_list`)).toBe(true);
        });

        it('should list indexes for specific table', async () => {
          const indexes = await storage.listIndexes('mastra_threads');
          expect(Array.isArray(indexes)).toBe(true);

          // Should include indexes for threads table
          expect(indexes.every(i => i.table === 'mastra_threads')).toBe(true);

          // Should include our test index
          expect(indexes.some(i => i.name === `${testIndexPrefix}_for_list`)).toBe(true);
        });

        it('should include index metadata', async () => {
          const indexes = await storage.listIndexes('mastra_threads');
          const testIndex = indexes.find(i => i.name === `${testIndexPrefix}_for_list`);

          expect(testIndex).toBeDefined();
          expect(testIndex).toMatchObject({
            name: `${testIndexPrefix}_for_list`,
            table: 'mastra_threads',
            columns: expect.arrayContaining(['resourceId', 'createdAt']),
            unique: false,
            size: expect.any(String),
            definition: expect.stringContaining('CREATE'),
          });
        });

        it('should list indexes for all mastra tables', async () => {
          const tables = ['mastra_threads', 'mastra_messages', 'mastra_traces', 'mastra_evals'];

          for (const table of tables) {
            const indexes = await storage.listIndexes(table);
            expect(Array.isArray(indexes)).toBe(true);
          }
        });
      });

      describe('Automatic Performance Indexes', () => {
        it('should have automatic composite indexes from initialization', async () => {
          const indexes = await storage.listIndexes();

          // Check for automatic composite indexes (these are created during init)
          const expectedPatterns = [
            'threads_resourceid_createdat',
            'messages_thread_id_createdat',
            'traces_name_starttime',
            'evals_agent_name_created_at',
          ];

          for (const pattern of expectedPatterns) {
            const hasIndex = indexes.some(i => i.name.toLowerCase().includes(pattern));
            expect(hasIndex).toBe(true);
          }
        });

        it('should handle schema prefixes in automatic indexes', async () => {
          // This test verifies that automatic indexes work correctly with schemas
          // The schema prefix handling is done internally by the storage adapter
          const indexes = await storage.listIndexes();

          // All automatic indexes should exist regardless of schema
          expect(indexes.some(i => i.name.includes('threads_resourceid_createdat'))).toBe(true);
          expect(indexes.some(i => i.name.includes('messages_thread_id_createdat'))).toBe(true);
        });
      });

      describe('Performance Impact', () => {
        it('should improve query performance with indexes', async () => {
          // Create a custom index for testing performance
          const indexName = `${testIndexPrefix}_perf`;
          await storage.createIndex({
            name: indexName,
            table: TABLE_THREADS,
            columns: ['resourceId', 'createdAt DESC'],
          });
          createdIndexes.push(indexName);

          // Insert some test data
          const testThreads = [];
          for (let i = 0; i < 100; i++) {
            testThreads.push({
              id: `perf-thread-${timestamp}-${i}`,
              resourceId: `perf-resource-${Math.floor(i / 10)}`,
              title: `Performance Test Thread ${i}`,
              createdAt: new Date(Date.now() - i * 1000),
              updatedAt: new Date(Date.now() - i * 1000),
              metadata: {},
            });
          }

          // Batch insert if available, otherwise insert one by one
          if (storage.batchInsert) {
            await storage.batchInsert({
              tableName: TABLE_THREADS,
              records: testThreads,
            });
          } else {
            for (const thread of testThreads) {
              await storage.insert({
                tableName: TABLE_THREADS,
                record: thread,
              });
            }
          }

          // Measure query performance
          const startTime = Date.now();
          await storage.getThreadsByResourceId({
            resourceId: `perf-resource-5`,
            orderBy: 'createdAt',
            sortDirection: 'DESC',
          });
          const queryTime = Date.now() - startTime;

          // With an index, the query should be reasonably fast
          // We set a generous limit since test environments vary
          expect(queryTime).toBeLessThan(500);

          // Clean up test data
          for (const thread of testThreads) {
            await storage.deleteThread({ threadId: thread.id });
          }
        });
      });
    });
  }
}
