import type { AISpanDatabaseRecord } from '../../../ai-tracing';
import type { PaginationInfo, StorageGetAiSpansPaginatedArg, StorageGetTracesPaginatedArg } from '../../types';
import type { StoreOperations } from '../operations';
import { ObservabilityStorage } from './base';

export type InMemoryAiSpans = Map<string, AISpanDatabaseRecord>;

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

    // Ensure the span has required fields
    if (!span.id) {
      throw new Error('AI span must have an id');
    }

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
    this.spans.set(span.id, span as AISpanDatabaseRecord);
  }

  async getAiSpan(id: string): Promise<Record<string, any> | null> {
    this.logger.debug(`MockStore: getAiSpan called`);
    return this.spans.get(id) ?? null;
  }

  async getAiSpansPaginated(args: StorageGetAiSpansPaginatedArg): Promise<PaginationInfo & { spans: Record<string, any>[] }> {
    this.logger.debug(`MockStore: getAiSpansPaginated called`);

    const { page = 0, perPage = 10, name, scope, attributes, filters, dateRange } = args;

    let spans = Array.from(this.collection.values());

    // Apply filters - following the same pattern as traces
    if (name) {
      spans = spans.filter(span => span.name?.startsWith(name));
    }

    if (scope) {
      // For scope filtering, we need to check if the span's scope has matching key-value pairs
      spans = spans.filter(span => {
        if (typeof scope === 'object' && scope !== null) {
          return Object.entries(scope).every(([key, value]) =>
            span.scope?.[key] === value
          );
        }
        return false;
      });
    }

    if (attributes) {
      spans = spans.filter(span =>
        Object.entries(attributes).every(([key, value]) => span.attributes?.[key] === value)
      );
    }

    if (filters) {
      spans = spans.filter(span =>
        Object.entries(filters).every(([key, value]) => span[key as keyof AISpanDatabaseRecord] === value)
      );
    }

    // Use createdAt for date filtering like traces implementation
    if (dateRange?.start) {
      spans = spans.filter(span => new Date(span.createdAt) >= dateRange.start!);
    }

    if (dateRange?.end) {
      spans = spans.filter(span => new Date(span.createdAt) <= dateRange.end!);
    }

    // Apply pagination and sort - startTime is a number, so we can sort directly
    spans.sort((a, b) => b.startTime - a.startTime);
    const start = page * perPage;
    const end = start + perPage;

    return {
      spans: spans.slice(start, end),
      total: spans.length,
      page,
      perPage,
      hasMore: spans.length > end,
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
