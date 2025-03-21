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

  afterAll(async () => {
    try {
      await vectorDB.deleteAllTables();
      console.log('All tables have been deleted');
    } catch (error) {
      console.warn('Failed to delete tables during cleanup:', error);
    } finally {
      vectorDB.close();
    }
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

        expect(stats?.metric).toBe('l2');
      });
    });

    describe('list indexes', () => {
      const listIndexTestTable = 'list-index-test-table' + Date.now();
      const indexColumnName = 'vector';

      afterAll(async () => {
        try {
          await vectorDB.deleteIndex(indexColumnName + '_idx');
        } catch (error) {
          console.warn('Failed to delete index during cleanup:', error);
        }
      });

      it('should list available indexes', async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: i + 1,
            vector: Array.from({ length: 3 }, () => Math.random()),
          }));
        };

        await vectorDB.createTable(listIndexTestTable, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: indexColumnName,
          dimension: 3,
          tableName: listIndexTestTable,
        });

        const indexes = await vectorDB.listIndexes();

        expect(indexes).toContain(indexColumnName + '_idx');
      });
    });

    describe('describe index', () => {
      const describeIndexTestTable = 'describe-index-test-table' + Date.now();
      const indexColumnName = 'vector';

      afterAll(async () => {
        try {
          await vectorDB.deleteIndex(indexColumnName + '_idx');
        } catch (error) {
          console.warn('Failed to delete index during cleanup:', error);
        }
      });
      it('should describe an existing index', async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: i + 1,
            vector: Array.from({ length: 3 }, () => Math.random()),
          }));
        };

        await vectorDB.createTable(describeIndexTestTable, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: indexColumnName,
          dimension: 3,
          metric: 'euclidean',
          tableName: describeIndexTestTable,
        });

        const stats = await vectorDB.describeIndex(indexColumnName + '_idx');

        expect(stats).toBeDefined();
        expect(stats?.dimension).toBe(3);
        expect(stats?.count).toBe(300);
        expect(stats?.metric).toBe('l2');
      });

      it('should throw error for non-existent index', async () => {
        const nonExistentIndex = 'non-existent-index-' + Date.now();

        await expect(vectorDB.describeIndex(nonExistentIndex)).rejects.toThrow('not found');
      });
    });

    describe('delete index', () => {
      const deleteIndexTestTable = 'delete-index-test-table' + Date.now();
      const indexColumnName = 'vector';

      beforeAll(async () => {
        vectorDB.deleteAllTables();
      });

      afterAll(async () => {
        try {
          await vectorDB.deleteIndex(indexColumnName + '_idx');
        } catch (error) {
          console.warn('Failed to delete index during cleanup:', error);
        }
      });

      it('should delete an existing index', async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: i + 1,
            vector: Array.from({ length: 3 }, () => Math.random()),
          }));
        };

        await vectorDB.createTable(deleteIndexTestTable, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: indexColumnName,
          dimension: 3,
          tableName: deleteIndexTestTable,
        });

        const indexesBefore = await vectorDB.listIndexes();
        expect(indexesBefore).toContain(indexColumnName + '_idx');

        await vectorDB.deleteIndex(indexColumnName + '_idx');

        const indexesAfter = await vectorDB.listIndexes();
        console.log('vishesh', indexesAfter);
        expect(indexesAfter).not.toContain(indexColumnName + '_idx');
      });

      it('should throw error when deleting non-existent index', async () => {
        const nonExistentIndex = 'non-existent-index-' + Date.now();

        await expect(vectorDB.deleteIndex(nonExistentIndex)).rejects.toThrow('not found');
      });
    });
  });
});
