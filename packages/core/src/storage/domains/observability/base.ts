import { MastraBase } from '../../../base';
import type { PaginationInfo, StorageGetAiTracesPaginatedArg } from '../../types';

export abstract class ObservabilityStorage extends MastraBase {
  constructor() {
    super({
      component: 'STORAGE',
      name: 'OBSERVABILITY',
    });
  }

  abstract createAiSpan(span: Record<string, any>): Promise<void>;

  abstract getAiSpan(id: string): Promise<Record<string, any> | null>;

  abstract getAiTracesPaginated(
    args: StorageGetAiTracesPaginatedArg,
  ): Promise<PaginationInfo & { spans: Record<string, any>[] }>;

  abstract updateAiSpan(id: string, updates: Partial<Record<string, any>>): Promise<void>;

  abstract deleteAiSpan(id: string): Promise<void>;

  abstract batchAiSpanCreate(args: { records: Record<string, any>[] }): Promise<void>;

  abstract batchAiSpanUpdate(args: { records: { id: string; updates: Partial<Record<string, any>> }[] }): Promise<void>;

  abstract batchAiSpanDelete(args: { ids: string[] }): Promise<void>;
}
