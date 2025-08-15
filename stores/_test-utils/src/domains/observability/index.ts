import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TABLE_AI_SPAN } from '@mastra/core/storage';
import type { MastraStorage } from '@mastra/core/storage';
import {
  createSampleAiSpan,
  createSampleAgentRunSpan,
  createSampleLLMSpan,
  createSampleToolSpan,
  createSampleWorkflowSpan
} from './data';

export function createObservabilityTests({ storage }: { storage: MastraStorage }) {
  describe('AI Span Operations', () => {
    beforeEach(async () => {
      await storage.clearTable({ tableName: TABLE_AI_SPAN });
    });

    describe('createAiSpan', () => {
      it('should create a new AI span with required fields', async () => {
        const span = createSampleAgentRunSpan('test-agent-run');

        await storage.createAiSpan(span);

        // Verify the span was created
        const retrievedSpan = await storage.getAiSpan(`${span.traceId}-${span.spanId}`);
        expect(retrievedSpan).toBeDefined();
        expect(retrievedSpan?.id).toBe(`${span.traceId}-${span.spanId}`);
        expect(retrievedSpan?.name).toBe(span.name);
        expect(retrievedSpan?.spanType).toBe(span.spanType);
        expect(retrievedSpan?.traceId).toBe(span.traceId);
      });

      it('should create AI spans of different types', async () => {
        const agentSpan = createSampleAgentRunSpan('agent-span');
        const llmSpan = createSampleLLMSpan('llm-span');
        const toolSpan = createSampleToolSpan('tool-span');
        const workflowSpan = createSampleWorkflowSpan('workflow-span');

        await storage.createAiSpan(agentSpan);
        await storage.createAiSpan(llmSpan);
        await storage.createAiSpan(toolSpan);
        await storage.createAiSpan(workflowSpan);

        expect(await storage.getAiSpan(`${agentSpan.traceId}-${agentSpan.spanId}`)).toBeDefined();
        expect(await storage.getAiSpan(`${llmSpan.traceId}-${llmSpan.spanId}`)).toBeDefined();
        expect(await storage.getAiSpan(`${toolSpan.traceId}-${toolSpan.spanId}`)).toBeDefined();
        expect(await storage.getAiSpan(`${workflowSpan.traceId}-${workflowSpan.spanId}`)).toBeDefined();
      });

      it('should handle spans with attributes and metadata', async () => {
        const span = createSampleAiSpan('test-span', 0,
          { environment: 'test', version: '1.0' },
          { environment: 'test', version: '1.0' },
          { agentId: 'agent-123', model: 'gpt-4' }
        );

        await storage.createAiSpan(span);

        const retrievedSpan = await storage.getAiSpan(`${span.traceId}-${span.spanId}`);
        expect(retrievedSpan?.attributes?.environment).toBe('test');
        expect(retrievedSpan?.attributes?.version).toBe('1.0');
        expect(retrievedSpan?.metadata?.agentId).toBe('agent-123');
        expect(retrievedSpan?.metadata?.model).toBe('gpt-4');
      });
    });

    describe('getAiSpan', () => {
      it('should retrieve an AI span by ID', async () => {
        const span = createSampleAgentRunSpan('test-span');
        await storage.createAiSpan(span);

        const retrievedSpan = await storage.getAiSpan(`${span.traceId}-${span.spanId}`);
        expect(retrievedSpan).toBeDefined();
        expect(retrievedSpan?.id).toBe(`${span.traceId}-${span.spanId}`);
      });

      it('should return null for non-existent span ID', async () => {
        const nonExistentId = `span-${randomUUID()}`;
        const result = await storage.getAiSpan(nonExistentId);
        expect(result).toBeNull();
      });
    });

    describe('getAiSpansPaginated', () => {
      it('should return paginated AI spans with total count', async () => {
        const spans = Array.from({ length: 15 }, (_, i) =>
          createSampleAgentRunSpan(`test-span-${i}`)
        );

        // Create all spans
        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        // Test first page
        const page1 = await storage.getAiSpansPaginated({
          page: 0,
          perPage: 8,
        });
        expect(page1.spans).toHaveLength(8);
        expect(page1.total).toBe(15);
        expect(page1.page).toBe(0);
        expect(page1.perPage).toBe(8);
        expect(page1.hasMore).toBe(true);

        // Test second page
        const page2 = await storage.getAiSpansPaginated({
          page: 1,
          perPage: 8,
        });
        expect(page2.spans).toHaveLength(7);
        expect(page2.total).toBe(15);
        expect(page2.page).toBe(1);
        expect(page2.perPage).toBe(8);
        expect(page2.hasMore).toBe(false);
      });

      it('should filter by name', async () => {
        const spans = [
          createSampleAgentRunSpan('agent-span-1'),
          createSampleAgentRunSpan('agent-span-2'),
          createSampleAgentRunSpan('llm-span-1'),
          createSampleAgentRunSpan('llm-span-2'),
        ];

        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const agentSpans = await storage.getAiSpansPaginated({
          name: 'agent-span',
          page: 0,
          perPage: 10,
        });
        expect(agentSpans.total).toBe(2);
        expect(agentSpans.spans.every(span => span.name.startsWith('agent-span'))).toBe(true);
      });

      it('should filter by scope', async () => {
        const scope1 = '0.10.0';
        const scope2 = '0.11.0';

        const span1 = createSampleAgentRunSpan('span-1', { core: scope1 });
        const span2 = createSampleAgentRunSpan('span-2', { core: scope2 });

        await storage.createAiSpan(span1);
        await storage.createAiSpan(span2);

        const scope1Spans = await storage.getAiSpansPaginated({
          scope: { core: scope1 },
          page: 0,
          perPage: 10,
        });
        expect(scope1Spans.total).toBe(1);
        expect(scope1Spans.spans[0]?.scope?.core).toBe(scope1);
      });

      it('should filter by attributes', async () => {
        const spans = [
          createSampleAiSpan('prod-span', 0, undefined, { environment: 'prod', region: 'us-east' }),
          createSampleAiSpan('dev-span', 0, undefined, { environment: 'dev', region: 'us-west' }),
          createSampleAiSpan('prod-span-2', 0, undefined, { environment: 'prod', region: 'eu-west' }),
        ];

        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const prodSpans = await storage.getAiSpansPaginated({
          attributes: { environment: 'prod' },
          page: 0,
          perPage: 10,
        });
        expect(prodSpans.total).toBe(2);
        expect(prodSpans.spans.every(span => span.attributes?.environment === 'prod')).toBe(true);
      });

      it('should filter by date range', async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dayBeforeYesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        const spans = [
          createSampleAiSpan('old-span', 0, undefined, undefined, undefined, dayBeforeYesterday),
          createSampleAiSpan('yesterday-span', 0, undefined, undefined, undefined, yesterday),
          createSampleAiSpan('today-span', 0, undefined, undefined, undefined, now),
        ];

        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const fromYesterday = await storage.getAiSpansPaginated({
          dateRange: { start: yesterday },
          page: 0,
          perPage: 10,
        });
        expect(fromYesterday.total).toBe(2);
        expect(fromYesterday.spans.every(span =>
          new Date(span.createdAt) >= yesterday
        )).toBe(true);

        const onlyToday = await storage.getAiSpansPaginated({
          dateRange: { start: now, end: now },
          page: 0,
          perPage: 10,
        });
        expect(onlyToday.total).toBe(1);
        expect(onlyToday.spans[0]?.name).toBe('today-span');
      });

      it('should sort by start time (newest first)', async () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        const spans = [
          createSampleAiSpan('oldest', 0, undefined, undefined, undefined, twoHoursAgo, twoHoursAgo.getTime()),
          createSampleAiSpan('middle', 0, undefined, undefined, undefined, oneHourAgo, oneHourAgo.getTime()),
          createSampleAiSpan('newest', 0, undefined, undefined, undefined, now, now.getTime()),
        ];

        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const result = await storage.getAiSpansPaginated({
          page: 0,
          perPage: 10,
        });

        expect(result.spans).toHaveLength(3);
        expect(result.spans[0]?.name).toBe('newest');
        expect(result.spans[1]?.name).toBe('middle');
        expect(result.spans[2]?.name).toBe('oldest');
      });
    });

    describe('updateAiSpan', () => {
      it('should update an existing AI span', async () => {
        const span = createSampleAgentRunSpan('test-span');
        await storage.createAiSpan(span);

        const updates = {
          name: 'updated-span-name',
          metadata: { status: 'completed', result: 'success' },
        };

        await storage.updateAiSpan(`${span.traceId}-${span.spanId}`, updates);

        const updatedSpan = await storage.getAiSpan(`${span.traceId}-${span.spanId}`);
        expect(updatedSpan?.name).toBe('updated-span-name');
        expect(updatedSpan?.metadata?.status).toBe('completed');
        expect(updatedSpan?.metadata?.result).toBe('success');
      });

      it('should throw error when updating non-existent span', async () => {
        const nonExistentId = `span-${randomUUID()}`;
        const updates = { name: 'updated-name' };

        await expect(storage.updateAiSpan(nonExistentId, updates)).rejects.toThrow();
      });
    });

    describe('deleteAiSpan', () => {
      it('should delete an existing AI span', async () => {
        const span = createSampleAgentRunSpan('test-span');
        await storage.createAiSpan(span);

        await storage.deleteAiSpan(`${span.traceId}-${span.spanId}`);

        const deletedSpan = await storage.getAiSpan(`${span.traceId}-${span.spanId}`);
        expect(deletedSpan).toBeNull();
      });

      it('should handle deleting non-existent span gracefully', async () => {
        const nonExistentId = `span-${randomUUID()}`;

        // Should not throw an error
        await storage.deleteAiSpan(nonExistentId);
      });
    });

    describe('Batch Operations', () => {
      it('should create multiple AI spans in batch', async () => {
        const spans = [
          createSampleAgentRunSpan('batch-span-1'),
          createSampleLLMSpan('batch-span-2'),
          createSampleToolSpan('batch-span-3'),
        ];

        await storage.batchAiSpanCreate({ records: spans });

        for (const span of spans) {
          const retrievedSpan = await storage.getAiSpan(`${span.traceId}-${span.spanId}`);
          expect(retrievedSpan).toBeDefined();
          expect(retrievedSpan?.id).toBe(`${span.traceId}-${span.spanId}`);
        }
      });

      it('should update multiple AI spans in batch', async () => {
        const spans = [
          createSampleAgentRunSpan('batch-update-1'),
          createSampleAgentRunSpan('batch-update-2'),
        ];

        // Create spans first
        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const updates = [
          { id: `${spans[0].traceId}-${spans[0].spanId}`, updates: { name: 'updated-1', metadata: { status: 'completed' } } },
          { id: `${spans[1].traceId}-${spans[1].spanId}`, updates: { name: 'updated-2', metadata: { status: 'completed' } } },
        ];

        await storage.batchAiSpanUpdate({ records: updates });

        for (const update of updates) {
          const updatedSpan = await storage.getAiSpan(update.id);
          expect(updatedSpan?.name).toBe(update.updates.name);
          expect(updatedSpan?.metadata?.status).toBe(update.updates.metadata.status);
        }
      });

      it('should delete multiple AI spans in batch', async () => {
        const spans = [
          createSampleAgentRunSpan('batch-delete-1'),
          createSampleAgentRunSpan('batch-delete-2'),
          createSampleAgentRunSpan('batch-delete-3'),
        ];

        // Create spans first
        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const idsToDelete = spans.map(span => `${span.traceId}-${span.spanId}`);
        await storage.batchAiSpanDelete({ ids: idsToDelete });

        for (const id of idsToDelete) {
          const deletedSpan = await storage.getAiSpan(id);
          expect(deletedSpan).toBeNull();
        }
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle spans with missing optional fields', async () => {
        const spanId = `span-${randomUUID()}`;
        const traceId = `trace-${randomUUID()}`;
        const minimalSpan = {
          id: `${traceId}-${spanId}`,
          traceId,
          spanId,
          parentSpanId: null,
          name: 'minimal-span',
          scope: null,
          spanType: 0,
          attributes: null,
          metadata: null,
          events: null,
          links: null,
          other: null,
          startTime: Date.now(),
          endTime: 0,
          createdAt: new Date(),
          input: null,
          output: null,
          error: null,
        };

        await storage.createAiSpan(minimalSpan);

        const retrievedSpan = await storage.getAiSpan(minimalSpan.id);
        expect(retrievedSpan).toBeDefined();
        expect(retrievedSpan?.id).toBe(minimalSpan.id);
      });

      it('should handle large numbers of spans', async () => {
        const largeSpans = Array.from({ length: 100 }, (_, i) =>
          createSampleAgentRunSpan(`large-span-${i}`)
        );

        // Create spans in smaller batches to avoid overwhelming the storage
        const batchSize = 20;
        for (let i = 0; i < largeSpans.length; i += batchSize) {
          const batch = largeSpans.slice(i, i + batchSize);
          await storage.batchAiSpanCreate({ records: batch });
        }

        const result = await storage.getAiSpansPaginated({
          page: 0,
          perPage: 50,
        });

        expect(result.total).toBe(100);
        expect(result.spans).toHaveLength(50);
        expect(result.hasMore).toBe(true);
      });
    });
  });
}
