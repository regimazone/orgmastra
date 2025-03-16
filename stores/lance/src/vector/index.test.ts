import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { LanceVectorStore } from './index';

describe('Lance vector store tests', () => {
  let vectorDB: LanceVectorStore;
  const connectionString = process.env.DB_URL || 'lancedb';

  beforeAll(() => {
    // Giving directory path to connect to in memory db
    // Give remote db url to connect to remote db such as s3 or lancedb cloud
    vectorDB = new LanceVectorStore(connectionString);
  });

  afterAll(() => {
    vectorDB.close();
  });

  describe('Index operations', () => {
    const testIndexName = 'test-index' + Date.now();

    afterAll(() => {
      vectorDB.deleteIndex(testIndexName);
    });

    describe('create index', () => {
      it('should create an index with specified dimensions', async () => {
        await vectorDB.createIndex({
          indexName: testIndexName,
          dimension: 3,
        });

        const stats = await vectorDB.describeIndex(testIndexName);

        expect(stats?.dimension).toBe(3);
        expect(stats?.count).toBe(0);
      });

      it('should create an index with specified metric', async () => {
        await vectorDB.createIndex({
          indexName: testIndexName,
          metric: 'euclidean',
          dimension: 3,
        });

        const stats = await vectorDB.describeIndex(testIndexName);

        expect(stats?.metric).toBe('euclidean');
      });

      it('should throw error if index already exists', async () => {
        await vectorDB.createIndex({
          indexName: testIndexName,
          dimension: 3,
        });

        await expect(
          vectorDB.createIndex({
            indexName: testIndexName,
            dimension: 3,
          }),
        ).rejects.toThrow('Index already exists');
      });
    });

    describe('list indexes', () => {});

    describe('describe index', () => {});

    describe('delete index', () => {});
  });
});
