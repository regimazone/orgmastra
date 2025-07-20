import { createTestSuite } from '@internal/storage-test-utils';
import type { MongoDBConfig } from './index';
import { MongoDBStore } from './index';

const TEST_CONFIG: MongoDBConfig = {
  url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
  dbName: process.env.MONGODB_DB_NAME || 'mastra-test-db',
};

createTestSuite(new MongoDBStore(TEST_CONFIG));