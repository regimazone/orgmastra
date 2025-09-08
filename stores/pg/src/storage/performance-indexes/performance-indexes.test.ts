import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostgresStore } from '../index';
import { StoreOperationsPG } from '../domains/operations';

// Mock pg-promise
const mockClient = {
  none: vi.fn(),
  one: vi.fn(),
  manyOrNone: vi.fn(),
};

const mockPgp = vi.fn(() => mockClient);
vi.mock('pg-promise', () => ({ default: vi.fn(() => mockPgp) }));

describe('PostgresStore Performance Indexes', () => {
  let store: PostgresStore;
  let operations: StoreOperationsPG;

  beforeEach(() => {
    vi.clearAllMocks();

    store = new PostgresStore({
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    operations = new StoreOperationsPG({
      client: mockClient as any,
      schemaName: 'test_schema',
    });

    // Mock hasColumn to return true for all columns
    vi.spyOn(operations, 'hasColumn').mockResolvedValue(true);
  });

  describe('createPerformanceIndexes', () => {
    it('should create all necessary performance indexes', async () => {
      await operations.createPerformanceIndexes();

      // Verify that CREATE INDEX statements were executed
      expect(mockClient.none).toHaveBeenCalledTimes(9); // 8 regular indexes + 1 conditional

      // Check that indexes for threads are created
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_threads_resourceid_idx'),
      );
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_threads_resourceid_createdat_idx'),
      );

      // Check that indexes for messages are created
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_messages_thread_id_idx'),
      );
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_messages_thread_id_createdat_idx'),
      );

      // Check that indexes for traces are created
      expect(mockClient.none).toHaveBeenCalledWith(expect.stringContaining('test_schema_mastra_traces_name_idx'));
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_traces_name_pattern_idx'),
      );

      // Check that indexes for evals are created
      expect(mockClient.none).toHaveBeenCalledWith(expect.stringContaining('test_schema_mastra_evals_agent_name_idx'));
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_evals_agent_name_created_at_idx'),
      );

      // Check that conditional workflow index is created when column exists
      expect(mockClient.none).toHaveBeenCalledWith(
        expect.stringContaining('test_schema_mastra_workflow_snapshot_resourceid_idx'),
      );
    });

    it('should skip conditional indexes when columns do not exist', async () => {
      // Mock hasColumn to return false for resourceId
      vi.spyOn(operations, 'hasColumn').mockResolvedValue(false);

      await operations.createPerformanceIndexes();

      // Should create 8 indexes (skip the conditional workflow index)
      expect(mockClient.none).toHaveBeenCalledTimes(8);

      // Verify the conditional index was not created
      const calls = mockClient.none.mock.calls;
      const workflowIndexCall = calls.find(call => call[0].includes('mastra_workflow_snapshot_resourceid_idx'));
      expect(workflowIndexCall).toBeUndefined();
    });

    it('should handle index creation errors gracefully', async () => {
      const error = new Error('Index creation failed');
      mockClient.none.mockRejectedValueOnce(error);

      await expect(operations.createPerformanceIndexes()).rejects.toThrow('Index creation failed');
    });

    it('should use CONCURRENTLY for index creation to avoid blocking', async () => {
      await operations.createPerformanceIndexes();

      const calls = mockClient.none.mock.calls;
      calls.forEach(call => {
        expect(call[0]).toContain('CREATE INDEX CONCURRENTLY');
      });
    });

    it('should use IF NOT EXISTS to prevent duplicate index creation', async () => {
      await operations.createPerformanceIndexes();

      const calls = mockClient.none.mock.calls;
      calls.forEach(call => {
        expect(call[0]).toContain('IF NOT EXISTS');
        expect(call[0]).toContain('pg_indexes');
      });
    });

    it('should work with default schema (public)', async () => {
      const publicOperations = new StoreOperationsPG({
        client: mockClient as any,
        // No schemaName provided, should default to public
      });

      vi.spyOn(publicOperations, 'hasColumn').mockResolvedValue(true);

      await publicOperations.createPerformanceIndexes();

      // Verify indexes are created without schema prefix
      const calls = mockClient.none.mock.calls;
      const firstCall = calls[0][0];
      expect(firstCall).toContain('mastra_threads_resourceid_idx'); // No schema prefix
      expect(firstCall).not.toContain('test_schema_');
    });
  });

  describe('PostgresStore initialization', () => {
    it('should create performance indexes during init without failing on index errors', async () => {
      // Mock the parent init
      const mockSuperInit = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(store)), 'init').mockImplementation(mockSuperInit);

      // Mock console.warn to capture warnings
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock index creation to fail
      mockClient.none.mockRejectedValue(new Error('Index creation failed'));

      // Init should still succeed even if index creation fails
      await expect(store.init()).resolves.not.toThrow();

      // Verify warning was logged
      expect(consoleSpy).toHaveBeenCalledWith('Failed to create performance indexes:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});
