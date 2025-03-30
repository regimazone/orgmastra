import { TABLE_MESSAGES } from '@mastra/core/storage';
import { describe, it, expect, beforeAll } from 'vitest';
import { LanceStorage } from './index';
import type { LanceStorageColumn } from './index';

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
    it('should create an empty table with given schema', async () => {
      const schema: Record<string, LanceStorageColumn> = {};

      await storage.createTable({ tableName: TABLE_MESSAGES, schema });
    });
  });
});
