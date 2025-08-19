import type { AISpanDatabaseRecord } from '@mastra/core/ai-tracing';
import { ObservabilityStorage } from '@mastra/core/storage';
import type { StorageGetAiTracesPaginatedArg } from '@mastra/core/storage';
import type { PaginationInfo } from '@mastra/core/storage';

export class ObservabilityMSSQL extends ObservabilityStorage {
  constructor() {
    super();
  }

  createAiSpan(span: Record<string, any>): Promise<void> {
    throw new Error('Method not implemented.');
  }

  getAiSpan(id: string): Promise<Record<string, any> | null> {
    throw new Error('Method not implemented.');
  }

  getAiTracesPaginated(
    args: StorageGetAiTracesPaginatedArg,
  ): Promise<PaginationInfo & { spans: Record<string, any>[] }> {
    throw new Error('Method not implemented.');
  }

  updateAiSpan(id: string, updates: Partial<AISpanDatabaseRecord>): Promise<void> {
    throw new Error('Method not implemented.');
  }

  deleteAiSpan(id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  batchAiSpanCreate(args: { records: Omit<AISpanDatabaseRecord, 'id' | 'createdAt' | 'updatedAt'>[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  batchAiSpanUpdate(args: { records: { id: string; updates: Partial<AISpanDatabaseRecord> }[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  batchAiSpanDelete(args: { ids: string[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
