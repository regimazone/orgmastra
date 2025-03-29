import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LanceVectorStore } from './index';
import { afterEach, beforeEach } from 'node:test';

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
        expect(indexesAfter).not.toContain(indexColumnName + '_idx');
      });

      it('should throw error when deleting non-existent index', async () => {
        const nonExistentIndex = 'non-existent-index-' + Date.now();

        await expect(vectorDB.deleteIndex(nonExistentIndex)).rejects.toThrow('not found');
      });
    });
  });

  describe('Create table operations', () => {
    const testTableName = 'test-table' + Date.now();

    beforeAll(async () => {
      vectorDB.deleteAllTables();
    });

    it('should throw error when no data is provided', async () => {
      await expect(vectorDB.createTable(testTableName, [])).rejects.toThrow(
        'Failed to create table: At least one record or a schema needs to be provided',
      );
    });

    it('should create a new table', async () => {
      await vectorDB.createTable(testTableName, [{ id: '1', vector: [0.1, 0.2, 0.3] }]);

      const tables = await vectorDB.listTables();
      expect(tables).toContain(testTableName);

      const schema = await vectorDB.getTableSchema(testTableName);
      expect(schema.fields.map(field => field.name)).toEqual(['id', 'vector']);
    });

    it('should throw error when creating existing table', async () => {
      const tableName = 'test-table' + Date.now();
      await vectorDB.createTable(tableName, [{ id: '1', vector: [0.1, 0.2, 0.3] }]);

      await expect(vectorDB.createTable(tableName, [{ id: '1', vector: [0.1, 0.2, 0.3] }])).rejects.toThrow(
        'already exists',
      );
    });

    it('should create a table with single level nested metadata object by flattening it', async () => {
      const tableName = 'test-table' + Date.now();
      await vectorDB.createTable(tableName, [{ id: '1', vector: [0.1, 0.2, 0.3], metadata_text: 'test' }]);

      const schema = await vectorDB.getTableSchema(tableName);
      expect(schema.fields.map((field: any) => field.name)).toEqual(['id', 'vector', 'metadata_text']);
    });

    it('should create a table with multi level nested metadata object by flattening it', async () => {
      const tableName = 'test-table' + Date.now();
      await vectorDB.createTable(tableName, [
        { id: '1', vector: [0.1, 0.2, 0.3], metadata: { text: 'test', newText: 'test' } },
      ]);

      const schema = await vectorDB.getTableSchema(tableName);
      expect(schema.fields.map((field: any) => field.name)).toEqual([
        'id',
        'vector',
        'metadata_text',
        'metadata_newText',
      ]);
    });
  });

  describe('Vector operations', () => {
    describe('upsert operations', () => {
      const testTableName = 'test-table-test' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: { text: 'test' },
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
      const testTableName = 'test-table-query' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: { text: 'test' },
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
          columns: ['id', 'metadata_text', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(results).toHaveLength(3);
        const sortedResultIds = results.map(res => res.id).sort();
        const sortedIds = ids.sort();
        expect(sortedResultIds).to.deep.equal(sortedIds);
        expect(results[0].metadata?.text).toBe('First vector');
        expect(results[1].metadata?.text).toBe('Second vector');
        expect(results[2].metadata?.text).toBe('Third vector');
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
        ).rejects.toThrow(`Failed to query vectors: Table '${nonExistentTable}' was not found`);
      });
    });

    describe('update operations', () => {
      const testTableName = 'test-table-update' + Date.now();
      const testTableIndexColumn = 'vector';

      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: { text: 'test' },
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
          columns: ['id', 'metadata_text', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(ids[0]);
        expect(res[0].metadata?.text).to.equal('Updated vector');

        // Fix decimal points in the response vector
        const fixedVector = res[0].vector?.map(num => Number(num.toFixed(1)));
        expect(fixedVector).toEqual([0.4, 0.5, 0.6]);
      });

      it('should only update existing vector', async () => {
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: [[0.1, 0.2, 0.3]],
          metadata: [{ text: 'Vector only update test' }],
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
          columns: ['id', 'metadata_text', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(ids[0]);
        expect(res[0].metadata?.text).to.equal('Vector only update test');

        // Fix decimal points in the response vector
        const fixedVector = res[0].vector?.map(num => Number(num.toFixed(1)));
        expect(fixedVector).toEqual([0.4, 0.5, 0.6]);
      });

      it('should only update existing vector metadata', async () => {
        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: [[0.1, 0.2, 0.3]],
          metadata: [{ text: 'Metadata only update test' }],
        });

        expect(ids).toHaveLength(1);
        expect(ids.every(id => typeof id === 'string')).toBe(true);

        await vectorDB.updateIndexById(testTableIndexColumn, ids[0], {
          metadata: { text: 'Updated metadata' },
        });

        const res = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.1, 0.2, 0.3],
          columns: ['id', 'metadata_text', 'vector'],
          topK: 3,
          includeVector: true,
        });

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(ids[0]);
        expect(res[0].metadata?.text).to.equal('Updated metadata');

        // Fix decimal points in the response vector
        const fixedVector = res[0].vector?.map(num => Number(num.toFixed(1)));
        expect(fixedVector).toEqual([0.1, 0.2, 0.3]);
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
            metadata: { text: 'test' },
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
        const testVectors = [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ];

        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: testVectors,
          metadata: [{ text: 'First vector' }, { text: 'Second vector' }],
        });

        expect(ids).toHaveLength(2);

        let results = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.1, 0.2, 0.3],
          columns: ['id', 'metadata_text'],
          topK: 3,
          includeVector: true,
        });

        expect(results).toHaveLength(2);

        await vectorDB.deleteIndexById(testTableIndexColumn, ids[0]);

        results = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.1, 0.2, 0.3],
          columns: ['id', 'metadata_text'],
          topK: 3,
          includeVector: true,
        });

        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(ids[1]);
      });
    });
  });

  describe('Basic query operations', () => {
    const testTableName = 'test-table-basic' + Date.now();
    const testTableIndexColumn = 'vector';

    beforeAll(async () => {
      const generateTableData = (numRows: number) => {
        return Array.from({ length: numRows }, (_, i) => ({
          id: String(i + 1),
          vector: Array.from({ length: 3 }, () => Math.random()),
          metadata_text: 'test',
          metadata_newText: 'test',
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

    it('should query vectors with metadata', async () => {
      const testVectors = [[0.1, 0.2, 0.3]];
      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [{ text: 'First vector', newText: 'hi' }],
      });

      expect(ids).toHaveLength(1);
      expect(ids.every(id => typeof id === 'string')).toBe(true);

      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: testVectors[0],
        columns: ['id', 'metadata_text', 'metadata_newText', 'vector'],
        topK: 3,
        includeVector: true,
      });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(ids[0]);
      expect(res[0].metadata?.text).to.equal('First vector');
      expect(res[0].metadata?.newText).to.equal('hi');
    });

    it('should query vectors with filter', async () => {
      const testVectors = [[0.1, 0.2, 0.3]];
      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [{ text: 'First vector', newText: 'hi' }],
      });

      expect(ids).toHaveLength(1);
      expect(ids.every(id => typeof id === 'string')).toBe(true);

      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: testVectors[0],
        columns: ['id', 'metadata_text', 'metadata_newText', 'vector'],
        topK: 3,
        includeVector: true,
        filter: { text: 'First vector' },
      });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(ids[0]);
      expect(res[0].metadata?.text).to.equal('First vector');
      expect(res[0].metadata?.newText).to.equal('hi');
    });

    it('should query vectors if filter columns array is not provided', async () => {
      const testVectors = [[0.1, 0.2, 0.3]];
      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [{ text: 'First vector', newText: 'hi' }],
      });

      expect(ids).toHaveLength(1);
      expect(ids.every(id => typeof id === 'string')).toBe(true);

      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: testVectors[0],
        topK: 3,
        includeVector: true,
        filter: { text: 'First vector' },
      });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(ids[0]);
      expect(res[0].metadata?.text).toBeUndefined();
      expect(res[0].metadata?.newText).toBeUndefined();
    });

    it('should query vectors with all columns when the include all columns flag is true', async () => {
      const testVectors = [[0.1, 0.2, 0.3]];
      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [{ text: 'First vector', newText: 'hi' }],
      });

      expect(ids).toHaveLength(1);
      expect(ids.every(id => typeof id === 'string')).toBe(true);

      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: testVectors[0],
        topK: 3,
        includeVector: true,
        filter: { text: 'First vector' },
        includeAllColumns: true,
      });

      const tableSchema = await vectorDB.getTableSchema(testTableName);
      const expectedColumns = tableSchema.fields.map((column: any) => column.name);
      expect(['id', 'vector', 'metadata_text', 'metadata_newText']).toEqual(expectedColumns);

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(ids[0]);
      expect(res[0].metadata?.text).toBe('First vector');
      expect(res[0].metadata?.newText).toBe('hi');
    });
  });

  describe('Advanced query operations', () => {
    const testTableName = 'test-table-advanced' + Date.now();
    const testTableIndexColumn = 'vector';

    beforeAll(async () => {
      vectorDB.deleteAllTables();

      const generateTableData = (numRows: number) => {
        return Array.from({ length: numRows }, (_, i) => ({
          id: String(i + 1),
          vector: Array.from({ length: 3 }, () => Math.random()),
          metadata: { name: 'test', details: { text: 'test' } },
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

    it('should query vectors with nested metadata filter', async () => {
      const testVectors = [[0.1, 0.2, 0.3]];
      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [{ name: 'test2', details: { text: 'test2' } }],
      });

      expect(ids).toHaveLength(1);
      expect(ids.every(id => typeof id === 'string')).toBe(true);

      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: testVectors[0],
        columns: ['id', 'metadata_name', 'metadata_details_text', 'vector'],
        topK: 3,
        includeVector: true,
        filter: { name: 'test2' },
      });

      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(ids[0]);
      expect(res[0].metadata?.name).to.equal('test2');
      expect(res[0].metadata?.details?.text).to.equal('test2');
    });

    it('should not throw error when filter is not provided', async () => {
      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: [0.1, 0.2, 0.3],
        topK: 3,
        includeVector: true,
        includeAllColumns: true,
      });

      expect(res).toHaveLength(1);
    });

    describe('query with $or operator', () => {
      const testTableName = 'test-or-operator';
      beforeAll(async () => {
        const generateTableData = (numRows: number) => {
          return Array.from({ length: numRows }, (_, i) => ({
            id: String(i + 1),
            vector: Array.from({ length: 3 }, () => Math.random()),
            metadata: { name: 'category_test', tag: 'important' },
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

      it('should query with logical $or operator for metadata filtering', async () => {
        // Insert test vectors with different metadata for testing $or
        const testVectors = [
          [0.4, 0.5, 0.6],
          [0.7, 0.8, 0.9],
        ];

        const ids = await vectorDB.upsert({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          vectors: testVectors,
          metadata: [
            { name: 'category_a', tag: 'important' },
            { name: 'category_b', tag: 'urgent' },
          ],
        });

        expect(ids).toHaveLength(2);

        // Query with $or operator
        const res = await vectorDB.query({
          indexName: testTableIndexColumn,
          tableName: testTableName,
          queryVector: [0.5, 0.6, 0.7],
          topK: 5,
          includeVector: true,
          includeAllColumns: true,
          filter: {
            $or: [{ name: 'category_a' }, { name: 'category_b' }],
          },
        });

        // Should find both of our inserted records
        expect(res.length).toBeGreaterThanOrEqual(2);
        // Verify results contain our inserted items
        const foundIds = res.map(item => item.id);
        expect(foundIds).toContain(ids[0]);
        expect(foundIds).toContain(ids[1]);
      });
    });

    it('should query with $and operator using comparison operators', async () => {
      // Insert test vectors with numeric metadata
      const testVectors = [
        [0.1, 0.1, 0.1],
        [0.2, 0.2, 0.2],
        [0.3, 0.3, 0.3],
      ];

      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [
          { score: 85, dateAdded: new Date('2023-01-15') },
          { score: 92, dateAdded: new Date('2023-02-20') },
          { score: 78, dateAdded: new Date('2023-03-10') },
        ],
      });

      expect(ids).toHaveLength(3);

      // Query with $and operator combining comparison operators
      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: [0.2, 0.2, 0.2],
        topK: 10,
        filter: {
          $and: [
            { score: { $gte: 80 } }, // Score greater than or equal to 80
            { score: { $lte: 95 } }, // Score less than or equal to 95
          ],
        },
      });

      // Should find the two records with scores in the 80-95 range
      expect(res.length).toBeGreaterThanOrEqual(2);

      // Verify results contain expected items
      const scoresFound = res.map(item => item.metadata?.score);
      expect(scoresFound).toContain(85);
      expect(scoresFound).toContain(92);
      expect(scoresFound).not.toContain(78);
    });

    it('should query with array $in operator', async () => {
      // Insert test vectors with array-compatible metadata
      const testVectors = [
        [0.4, 0.4, 0.4],
        [0.5, 0.5, 0.5],
        [0.6, 0.6, 0.6],
      ];

      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [
          { region: 'north', status: 'active' },
          { region: 'south', status: 'pending' },
          { region: 'east', status: 'inactive' },
        ],
      });

      expect(ids).toHaveLength(3);

      // Query with $in operator to match multiple possible values
      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: [0.5, 0.5, 0.5],
        topK: 10,
        filter: {
          region: { $in: ['north', 'south'] },
        },
      });

      // Should find two records with matching regions
      expect(res.length).toBeGreaterThanOrEqual(2);

      // Verify results contain expected regions
      const regionsFound = res.map(item => item.metadata?.region);
      expect(regionsFound).toContain('north');
      expect(regionsFound).toContain('south');
      expect(regionsFound).not.toContain('east');
    });

    it('should query with nested comparison and pattern matching', async () => {
      // Insert test vectors with nested metadata
      const testVectors = [
        [0.7, 0.7, 0.7],
        [0.8, 0.8, 0.8],
      ];

      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [
          {
            profile: {
              username: 'john_doe',
              email: 'john@example.com',
              metrics: { visits: 42, likes: 156 },
            },
          },
          {
            profile: {
              username: 'jane_smith',
              email: 'jane@example.com',
              metrics: { visits: 64, likes: 89 },
            },
          },
        ],
      });

      expect(ids).toHaveLength(2);

      // Query with a complex filter combining nested paths and pattern matching
      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: [0.75, 0.75, 0.75],
        topK: 10,
        filter: {
          $and: [{ 'profile.metrics.visits': { $gt: 40 } }, { 'profile.email': { $like: '%example.com' } }],
        },
      });

      // Should find both records that match criteria
      expect(res.length).toBeGreaterThanOrEqual(2);

      // Verify results contain expected usernames
      const usernamesFound = res.map(item => item.metadata?.profile?.username);
      expect(usernamesFound).toContain('john_doe');
      expect(usernamesFound).toContain('jane_smith');
    });

    it('should query with regex pattern matching', async () => {
      // Insert test vectors with text metadata for regex testing
      const testVectors = [
        [0.9, 0.9, 0.9],
        [1.0, 1.0, 1.0],
        [1.1, 1.1, 1.1],
      ];

      const ids = await vectorDB.upsert({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        vectors: testVectors,
        metadata: [
          { code: 'US-CA-123', description: 'California office' },
          { code: 'UK-LN-456', description: 'London office' },
          { code: 'US-NY-789', description: 'New York office' },
        ],
      });

      expect(ids).toHaveLength(3);

      // Query with regex to find US-based entries
      const res = await vectorDB.query({
        indexName: testTableIndexColumn,
        tableName: testTableName,
        queryVector: [1.0, 1.0, 1.0],
        topK: 10,
        filter: {
          code: { $regex: '^US-' },
        },
      });

      // Should find two US-based records
      expect(res.length).toBeGreaterThanOrEqual(2);

      // Verify results contain expected codes
      const codesFound = res.map(item => item.metadata?.code);
      expect(codesFound).toContain('US-CA-123');
      expect(codesFound).toContain('US-NY-789');
      expect(codesFound).not.toContain('UK-LN-456');
    });
  });
});
