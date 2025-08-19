import type { AITrace, PaginationInfo, StorageGetAiTracesPaginatedArg } from '../../types';
import type { StoreOperations } from '../operations';
import { ObservabilityStorage } from './base';

interface AISpanRecord {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  scope: Record<string, any> | null;
  spanType: number;
  attributes: Record<string, any> | null;
  metadata: Record<string, any> | null;
  events: Record<string, any> | null;
  links: Record<string, any> | null;
  other: string | null;
  startTime: number;
  endTime: number;
  createdAt: Date;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  error: Record<string, any> | null;
}

export type InMemoryAiSpans = Map<string, AISpanRecord>;

export class ObservabilityInMemory extends ObservabilityStorage {
  spans: InMemoryAiSpans;
  operations: StoreOperations;
  collection: InMemoryAiSpans;

  constructor({ collection, operations }: { collection: InMemoryAiSpans; operations: StoreOperations }) {
    super();
    this.collection = collection;
    this.spans = collection;
    this.operations = operations;
  }

  async createAiSpan(span: Record<string, any>): Promise<void> {
    this.logger.debug(`MockStore: createAiSpan called`, { span });

    const id = `${span.traceId}-${span.spanId}`;
    // Ensure the span has required fields
    if (!span.name) {
      throw new Error('AI span must have a name');
    }

    if (span.spanType === undefined || span.spanType === null) {
      throw new Error('AI span must have a spanType');
    }

    if (!span.startTime) {
      throw new Error('AI span must have a startTime');
    }

    if (!span.traceId) {
      throw new Error('AI span must have a traceId');
    }

    // Add timestamps if not present
    if (!span.createdAt) {
      span.createdAt = new Date();
    }

    if (!span.updatedAt) {
      span.updatedAt = new Date();
    }

    // Store the span in memory
    this.spans.set(id, { ...span, id } as AISpanRecord);
  }

  async getAiSpan(id: string): Promise<Record<string, any> | null> {
    this.logger.debug(`MockStore: getAiSpan called`);
    return this.spans.get(id) ?? null;
  }

  async getAiTrace(traceId: string): Promise<AITrace | null> {
    this.logger.debug(`MockStore: getAiTrace called`);
    const allSpans = Array.from(this.collection.values());
    const traceSpans = allSpans.filter(span => span.traceId === traceId);

    if (traceSpans.length === 0) {
      return null;
    }

    return {
      traceId,
      spans: traceSpans,
    };
  }

  async getAiTracesPaginated(
    args: StorageGetAiTracesPaginatedArg,
  ): Promise<PaginationInfo & { spans: Record<string, any>[] }> {
    this.logger.debug(`MockStore: GetAiTracesPaginated called`);

    const { page = 0, perPage = 10, filters, dateRange } = args;

    // Get all spans first
    let allSpans = Array.from(this.collection.values());

    // Separate parent and child spans first
    const allParentSpans = allSpans.filter(span => !span.parentSpanId);
    const allChildSpans = allSpans.filter(span => span.parentSpanId);

    let filteredParentSpans = [...allParentSpans];

    if (filters) {
      if (filters.name && typeof filters.name === 'string') {
        filteredParentSpans = filteredParentSpans.filter(span => span.name === filters.name);
      }

      if (filters.attributes && typeof filters.attributes === 'object') {
        filteredParentSpans = filteredParentSpans.filter(span =>
          Object.entries(filters.attributes!).every(([key, value]) => {
            if (key.includes('.')) {
              const keys = key.split('.');
              let currentValue: any = span.attributes;
              for (const k of keys) {
                if (currentValue && typeof currentValue === 'object') {
                  currentValue = currentValue[k];
                } else {
                  return false;
                }
              }
              return currentValue === value;
            } else {
              return span.attributes?.[key] === value;
            }
          }),
        );
      }

      if (filters.error && typeof filters.error === 'object') {
        filteredParentSpans = filteredParentSpans.filter(span =>
          Object.entries(filters.error!).every(([key, value]) => {
            if (key.includes('.')) {
              const keys = key.split('.');
              let currentValue: any = span.error;
              for (const k of keys) {
                if (currentValue && typeof currentValue === 'object') {
                  currentValue = currentValue[k];
                } else {
                  return false;
                }
              }
              return currentValue === value;
            } else {
              return span.error?.[key] === value;
            }
          }),
        );
      }

      // CreatedAt filtering
      if (filters.createdAt !== undefined) {
        if (filters.createdAt instanceof Date) {
          filteredParentSpans = filteredParentSpans.filter(span => new Date(span.createdAt) >= filters.createdAt!);
        } else {
          filteredParentSpans = filteredParentSpans.filter(span => span.createdAt === filters.createdAt!);
        }
      }

      // TraceId filtering
      if (filters.traceId !== undefined) {
        filteredParentSpans = filteredParentSpans.filter(span => span.traceId === filters.traceId);
      }

      // SpanType filtering
      if (filters.spanType !== undefined) {
        filteredParentSpans = filteredParentSpans.filter(span => span.spanType === filters.spanType);
      }
    }

    // Use createdAt for date filtering on parent spans only
    if (dateRange?.start) {
      filteredParentSpans = filteredParentSpans.filter(span => new Date(span.createdAt) >= dateRange.start!);
    }

    if (dateRange?.end) {
      filteredParentSpans = filteredParentSpans.filter(span => new Date(span.createdAt) <= dateRange.end!);
    }

    // Sort parent spans by creation time (newest first)
    filteredParentSpans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination to filtered parent spans only
    const start = page * perPage;
    const end = start + perPage;
    const paginatedParentSpans = filteredParentSpans.slice(start, end);

    // Get all child spans for the paginated parent spans
    const traceIds = paginatedParentSpans.map(span => span.traceId);
    const relatedChildSpans = allChildSpans.filter(span => traceIds.includes(span.traceId));

    // Combine paginated parent spans with their children
    const resultSpans = [...paginatedParentSpans, ...relatedChildSpans];

    return {
      spans: resultSpans,
      total: filteredParentSpans.length, // Total count of filtered parent spans only
      page,
      perPage,
      hasMore: filteredParentSpans.length > end,
    };
  }

  async updateAiSpan(id: string, updates: Partial<Record<string, any>>): Promise<void> {
    this.logger.debug(`MockStore: updateAiSpan called`);

    const span = this.spans.get(id);
    if (!span) {
      throw new Error(`AI span with id ${id} not found`);
    }

    // Update the span with new data
    const updatedSpan = { ...span, ...updates };
    this.spans.set(id, updatedSpan);
  }

  async deleteAiSpan(id: string): Promise<void> {
    this.logger.debug(`MockStore: deleteAiSpan called`);
    this.spans.delete(id);
  }

  async batchAiSpanCreate(args: { records: Record<string, any>[] }): Promise<void> {
    this.logger.debug('MockStore: batchAiSpanCreate called', { count: args.records.length });

    for (const record of args.records) {
      await this.createAiSpan(record);
    }
  }

  async batchAiSpanUpdate(args: { records: { id: string; updates: Partial<Record<string, any>> }[] }): Promise<void> {
    this.logger.debug('MockStore: batchAiSpanUpdate called', { count: args.records.length });

    for (const record of args.records) {
      await this.updateAiSpan(record.id, record.updates);
    }
  }

  async batchAiSpanDelete(args: { ids: string[] }): Promise<void> {
    this.logger.debug('MockStore: batchAiSpanDelete called', { count: args.ids.length });

    for (const id of args.ids) {
      await this.deleteAiSpan(id);
    }
  }
}

export { ObservabilityStorage } from './base';
