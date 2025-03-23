import { describe, it, expect, beforeAll, afterAll, should } from 'vitest';
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
          id: String(i + 1),
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
            id: String(i + 1),
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
            id: String(i + 1),
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
            id: String(i + 1),
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

  describe('Vector operations', () => {
    describe('upsert operations', () => {
      const testTableName = 'test-table' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: JSON.stringify({}),
          }));
        };

        await vectorDB.createTable(testTableName, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: testTableIndexColumn,
          dimension: 3,
          tableName: testTableName,
        });
      });

      afterAll(async () => {
        vectorDB.deleteTable(testTableName);
      });

      it('should upsert vectors in an existing table', async () => {
        const testVectors = [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
          [0.7, 0.8, 0.9],
        ];

        const testMetadata = [{ text: 'First vector' }, { text: 'Second vector' }, { text: 'Third vector' }];

        // Test upsert with auto-generated IDs
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: testVectors,
          metadata: testMetadata,
        });

        expect(ids).toHaveLength(3);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        // Test upsert with provided IDs (update existing vectors)
        const updatedVectors = [
          [1.1, 1.2, 1.3],
          [1.4, 1.5, 1.6],
          [1.7, 1.8, 1.9],
        ];

        const updatedMetadata = [
          { text: 'First vector updated' },
          { text: 'Second vector updated' },
          { text: 'Third vector updated' },
        ];

        const updatedIds = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: updatedVectors,
          metadata: updatedMetadata,
          ids,
        });

        expect(updatedIds).toEqual(ids);
      });

      it('should throw error when upserting to non-existent table', async () => {
        const nonExistentTable = 'non-existent-table-' + Date.now();

        await expect(
          vectorDB.upsert({
            indexName: testTableIndexColumn,
            tableName: nonExistentTable,
            vectors: [[0.1, 0.2, 0.3]],
          }),
        ).rejects.toThrow('does not exist');
      });
    });

    describe('query operations', () => {
      const testTableName = 'test-table' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: JSON.stringify({}),
          }));
        };

        await vectorDB.createTable(testTableName, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: testTableIndexColumn,
          dimension: 3,
          tableName: testTableName,
        });
      });

      afterAll(async () => {
        vectorDB.deleteTable(testTableName);
      });

      it('should query vectors from an existing table', async () => {
        const testVectors = [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
          [0.7, 0.8, 0.9],
        ];

        const testMetadata = [{ text: 'First vector' }, { text: 'Second vector' }, { text: 'Third vector' }];

        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: testVectors,
          metadata: testMetadata,
        });

        expect(ids).toHaveLength(3);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        const results = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: testVectors[0],
          columns: ['id', 'metadata', 'vector'],
          topK: 3,
        });

        expect(results).toHaveLength(3);
        const sortedResultIds = results.map(res => res.id).sort();
        const sortedIds = ids.sort();
        expect(sortedResultIds).to.deep.equal(sortedIds);

        for (const meta of testMetadata) {
          expect(results.some(res => JSON.stringify(res.metadata) === JSON.stringify(meta))).to.be.true;
        }
      });

      it('should throw error when querying from non-existent table', async () => {
        const nonExistentTable = 'non-existent-table-' + Date.now();

        await expect(
          vectorDB.query({
            indexName: testTableIndexColumn,
            tableName: nonExistentTable,
            columns: ['id', 'vector', 'metadata'],
            queryVector: [0.1, 0.2, 0.3],
          }),
        ).rejects.toThrow(`Failed to query: Error: Table '${nonExistentTable}' was not found`);
      });
    });

    describe('update operations', () => {
      const testTableName = 'test-table' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: JSON.stringify({}),
          }));
        };

        await vectorDB.createTable(testTableName, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: testTableIndexColumn,
          dimension: 3,
          tableName: testTableName,
        });
      });

      afterAll(async () => {
        vectorDB.deleteTable(testTableName);
      });

      it('should update vector and metadata by id', async () => {
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: [[0.1, 0.2, 0.3]],
          metadata: [{ text: 'First vector' }],
        });

        expect(ids).toHaveLength(1);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        await vectorDB.updateIndexById(testTableIndexColumn, ids[0], {
          vector: [0.4, 0.5, 0.6],
          metadata: { text: 'Updated vector' },
        });

        const res = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.4, 0.5, 0.6],
          columns: ['id', 'metadata', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(ids[0]);
        expect(res[0].metadata).to.deep.equal({ text: 'Updated vector' });
        expect(res[0].vector?.map(num => Number(num.toFixed(1)))).to.deep.equal([0.4, 0.5, 0.6]);
      });

      it('should only update existing vector', async () => {
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: [[0.1, 0.2, 0.3]],
          metadata: [{ text: 'First vector' }],
        });

        expect(ids).toHaveLength(1);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        await vectorDB.updateIndexById(testTableIndexColumn, ids[0], {
          vector: [0.4, 0.5, 0.6],
        });

        const res = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.4, 0.5, 0.6],
          columns: ['id', 'metadata', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(ids[0]);
        expect(res[0].metadata).to.deep.equal({ text: 'First vector' });
        expect(res[0].vector?.map(num => Number(num.toFixed(1)))).to.deep.equal([0.4, 0.5, 0.6]);
      });

      it('should only update existing vector metadata', async () => {
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: [[0.1, 0.2, 0.3]],
          metadata: [{ text: 'First vector' }],
        });

        expect(ids).toHaveLength(1);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        // First, query to get the original vector
        const originalResult = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.1, 0.2, 0.3],
          columns: ['id', 'metadata', 'vector'],
          topK: 1,
          includeVector: true,
        });

        expect(originalResult).toHaveLength(1);
        expect(originalResult[0].id).toBe(ids[0]);
        expect(originalResult[0].metadata).to.deep.equal({ text: 'First vector' });
        expect(originalResult[0].vector).to.deep.equal([0.1, 0.2, 0.3]);

        // Update only the metadata
        await vectorDB.updateIndexById(testTableIndexColumn, ids[0], {
          // vector: [1, 2, 3],
          metadata: { text: 'Updated vector' },
        });

        // Query again to verify changes
        const updatedResult = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.1, 0.2, 0.3],
          columns: ['id', 'metadata', 'vector'],
          topK: 1,
          includeVector: true,
        });

        expect(updatedResult).toHaveLength(1);
        expect(updatedResult[0].id).toBe(ids[0]);
        expect(updatedResult[0].metadata).to.deep.equal({ text: 'Updated vector' });
      });
    });

    describe('delete operations', () => {
      const testTableName = 'test-table-delete' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        vectorDB.deleteAllTables();

        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: JSON.stringify({}),
          }));
        };

        await vectorDB.createTable(testTableName, generateTableData(300));

        await vectorDB.createIndex({
          indexConfig: {
            type: 'ivfflat',
            numPartitions: 1,
            numSubVectors: 1,
          },
          indexName: testTableIndexColumn,
          dimension: 3,
          tableName: testTableName,
        });
      });

      afterAll(async () => {
        vectorDB.deleteTable(testTableName);
      });

      it('should delete vector and metadata by id', async () => {
        const testVectors = [[0.1, 0.2, 0.3]];
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: testVectors,
          metadata: [{ text: 'First vector' }],
        });

        expect(ids).toHaveLength(1);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        // Check if the vector is present in the index
        const res = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: testVectors[0],
          columns: ['id', 'metadata', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(ids[0]);
        expect(res[0].metadata).to.deep.equal({ text: 'First vector' });

        await vectorDB.deleteIndexById(testTableIndexColumn, ids[0]);

        const results = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: testVectors[0],
          columns: ['id', 'metadata', 'vector'],
          topK: 3,
        });

        expect(results).toHaveLength(0);
      });
    });
  });
});
