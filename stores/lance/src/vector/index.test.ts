import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LanceVectorStore } from './index';

describe('Lance vector store tests', () => {
  let vectorDB: LanceVectorStore;
  const connectionString = process.env.DB_URL || 'lancedb';

  beforeAll(async () => {
    // Giving directory path to connect to in memory db
    // Give remote db url to connect to remote db such as s3 or lancedb cloud
    vectorDB = await LanceVectorStore.create(connectionString);
  });

  afterAll(() => {
    vectorDB.close();
  });

  describe('Index operations', () => {
    const testTableName = 'test-table' + Date.now();
    const indexOnColumn = 'vector';

    beforeAll(async () => {
      const generateTableData = (numRows: number) => {
        return Array.from({ length: numRows }, (_, i) => ({
          id: i + 1,
          vector: Array.from({ length: 3 }, () => Math.random()),
        }));
      };

      // lancedb requires to create more than 256 rows for index creation
      // otherwise it will throw an error
      await vectorDB.createTable(testTableName, generateTableData(300));
    });

    afterAll(async () => {
      try {
        await vectorDB.deleteIndex(indexOnColumn);
      } catch (error) {
        console.warn('Failed to delete index during cleanup:', error);
      }
    });

    describe('create index', () => {
      it('should create an index with specified dimensions', async () => {
        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: indexOnColumn,
          dimension: 2,
          tableName: testTableName,
        });

        const stats = await vectorDB.describeIndex(indexOnColumn + '_idx');

        expect(stats?.dimension).toBe(3);
        expect(stats?.count).toBe(300);
      });

      it('should create an index for hnsw', async () => {
        await vectorDB.createIndex({
          indexConfig: {
            type: 'hnsw',
            hnsw: {
              m: 16,
              efConstruction: 100,
            },
          },
          indexName: indexOnColumn,
          metric: 'euclidean',
          dimension: 2,
          tableName: testTableName,
        });

        const stats = await vectorDB.describeIndex(indexOnColumn + '_idx');

        expect(stats?.metric).toBe('euclidean');
      });

      it('should throw error if index already exists', async () => {
        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
          },
          indexName: indexOnColumn,
          dimension: 2,
          tableName: testTableName,
        });

        await expect(
          vectorDB.createIndex({
            indexName: indexOnColumn,
            dimension: 3,
            tableName: testTableName,
          }),
        ).rejects.toThrow('Index already exists');
      });
    });

    describe('list indexes', () => {});

    describe('describe index', () => {});

    describe('delete index', () => {});
  });
});
