import type { AISpanDatabaseRecord } from '@mastra/core/ai-tracing';
import { ObservabilityStorage } from '@mastra/core/storage';
import type { StorageGetAiTracesPaginatedArg, PaginationInfo } from '@mastra/core/storage';

export class ObservabilityMSSQL extends ObservabilityStorage {
  constructor() {
    super();
  }

  createAiSpan(_span: Record<string, any>): Promise<void> {
    throw new Error('Method not implemented.');
  }

  getAiSpan(_id: string): Promise<Record<string, any> | null> {
    throw new Error('Method not implemented.');
  }

  getAiTracesPaginated(
    _args: StorageGetAiTracesPaginatedArg,
  ): Promise<PaginationInfo & { spans: Record<string, any>[] }> {
    throw new Error('Method not implemented.');
  }

  updateAiSpan(_id: string, _updates: Partial<AISpanDatabaseRecord>): Promise<void> {
    throw new Error('Method not implemented.');
  }

  deleteAiSpan(_id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  batchAiSpanCreate(_args: { records: Omit<AISpanDatabaseRecord, 'id' | 'createdAt' | 'updatedAt'>[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  batchAiSpanUpdate(_args: { records: { id: string; updates: Partial<AISpanDatabaseRecord> }[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }

  batchAiSpanDelete(_args: { ids: string[] }): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
