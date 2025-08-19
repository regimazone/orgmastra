import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TABLE_AI_SPAN } from '@mastra/core/storage';
import type { MastraStorage } from '@mastra/core/storage';
import {
  createSampleAgentRunSpan,
  createSampleAiSpan,
  createSampleLLMSpan,
  createSampleToolSpan,
  createSampleWorkflowSpan,
  createSpanHierarchy,
  createMultipleSpanHierarchies,
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
        const span = createSampleAiSpan(
          'test-span',
          0,
          { environment: 'test', version: '1.0' },
          { environment: 'test', version: '1.0' },
          { agentId: 'agent-123', model: 'gpt-4' },
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

    describe('GetAiTracesPaginated', () => {
      it('should return paginated AI spans with total count based on parent spans only', async () => {
        // Create 15 span hierarchies (each with 1 parent + 2 children)
        const hierarchies = createMultipleSpanHierarchies(15, {
          parentNamePrefix: 'parent-span',
          childNames: ['child-1', 'child-2'],
        });

        // Create all parent spans first
        for (const { parent } of hierarchies) {
          await storage.createAiSpan(parent);
        }

        // Create all child spans with correct parentSpanId
        for (const { parent, children } of hierarchies) {
          const parentId = `${parent.traceId}-${parent.spanId}`;

          for (const child of children) {
            (child as any).parentSpanId = parentId;
            await storage.createAiSpan(child);
          }
        }

        // Test first page - should return 8 parent spans + all their children
        const page1 = await storage.getAiTracesPaginated({
          page: 0,
          perPage: 8,
        });

        // 8 parent spans + 16 child spans (2 per parent)
        expect(page1.spans).toHaveLength(24);
        expect(page1.total).toBe(15); // Total parent spans
        expect(page1.page).toBe(0);
        expect(page1.perPage).toBe(8);
        expect(page1.hasMore).toBe(true);

        // Test second page - should return 7 parent spans + all their children
        const page2 = await storage.getAiTracesPaginated({
          page: 1,
          perPage: 8,
        });
        // 7 parent spans + 14 child spans (2 per parent)
        expect(page2.spans).toHaveLength(21);
        expect(page2.total).toBe(15); // Total parent spans
        expect(page2.page).toBe(1);
        expect(page2.perPage).toBe(8);
        expect(page2.hasMore).toBe(false);
      });

      it('should filter by name on parent spans only', async () => {
        // Create span hierarchies with different names
        const hierarchies = [
          createSpanHierarchy('agent-parent-1', ['child-1']),
          createSpanHierarchy('agent-parent-2', ['child-2']),
          createSpanHierarchy('llm-parent-1', ['child-3']),
          createSpanHierarchy('llm-parent-2', ['child-4']),
        ];

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        // Filter by exact name - should only match parent spans with exact names
        const agentSpans = await storage.getAiTracesPaginated({
          filters: {
            name: 'agent-parent-1',
          },
          page: 0,
          perPage: 10,
        });
        expect(agentSpans.total).toBe(1); // Only parent spans count toward total
        expect(agentSpans.spans).toHaveLength(2); // 1 parent + 1 child span
      });

      it('should filter by attributes using JSON field extraction', async () => {
        const attributes1 = { environment: 'prod', region: 'us-east' };
        const attributes2 = { environment: 'dev', region: 'us-west' };

        const hierarchy1 = createSpanHierarchy('prod-parent', ['prod-child'], { attributes: attributes1 });
        const hierarchy2 = createSpanHierarchy('dev-parent', ['dev-child'], { attributes: attributes2 });

        // Create all spans
        for (const { parent, children } of [hierarchy1, hierarchy2]) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        // Filter by attributes - should match using json_extract
        const prodSpans = await storage.getAiTracesPaginated({
          filters: {
            attributes: { environment: attributes1.environment },
          },
          page: 0,
          perPage: 10,
        });
        expect(prodSpans.total).toBe(1); // Only parent spans count
        expect(prodSpans.spans).toHaveLength(2); // 1 parent + 1 child
        expect(prodSpans.spans.every(span => span.attributes?.environment === attributes1.environment)).toBe(true);
      });

      it('should return complete span trees with nested children', async () => {
        // Create a multi-level span hierarchy
        const parentSpan = createSampleAgentRunSpan('parent');
        const childSpan = createSampleAgentRunSpan('child');
        const grandchildSpan = createSampleAgentRunSpan('grandchild');
        const greatGrandchildSpan = createSampleAgentRunSpan('great-grandchild');

        // Ensure all spans share the same traceId
        const sharedTraceId = parentSpan.traceId;
        (childSpan as any).traceId = sharedTraceId;
        (grandchildSpan as any).traceId = sharedTraceId;
        (greatGrandchildSpan as any).traceId = sharedTraceId;

        // Create parent span first
        await storage.createAiSpan(parentSpan);

        // Set child's parentSpanId to parent's actual ID
        (childSpan as any).parentSpanId = `${parentSpan.traceId}-${parentSpan.spanId}`;
        await storage.createAiSpan(childSpan);

        // Set grandchild's parentSpanId to child's actual ID
        (grandchildSpan as any).parentSpanId = `${childSpan.traceId}-${childSpan.spanId}`;
        await storage.createAiSpan(grandchildSpan);

        // Set great-grandchild's parentSpanId to grandchild's actual ID
        (greatGrandchildSpan as any).parentSpanId = `${grandchildSpan.traceId}-${grandchildSpan.spanId}`;
        await storage.createAiSpan(greatGrandchildSpan);

        // Get paginated results
        const result = await storage.getAiTracesPaginated({ page: 0, perPage: 1 });

        // Should return 1 parent span + all its descendants
        expect(result.spans).toHaveLength(4);
        expect(result.total).toBe(1); // Only parent spans count toward total

        // Verify all spans share the same traceId
        const allTraceIds = result.spans.map(s => s.traceId);
        expect(allTraceIds.every(id => id === sharedTraceId)).toBe(true);

        // Verify parent-child relationships
        const parentSpanInResult = result.spans.find(s => s.parentSpanId === null);
        const childSpanInResult = result.spans.find(s => s.name === 'child');
        const grandchildSpanInResult = result.spans.find(s => s.name === 'grandchild');
        const greatGrandchildSpanInResult = result.spans.find(s => s.name === 'great-grandchild');

        expect(parentSpanInResult).toBeDefined();
        expect(childSpanInResult).toBeDefined();
        expect(grandchildSpanInResult).toBeDefined();
        expect(greatGrandchildSpanInResult).toBeDefined();

        // Verify parentSpanId relationships
        expect(childSpanInResult?.parentSpanId).toBe(`${parentSpan.traceId}-${parentSpan.spanId}`);
        expect(grandchildSpanInResult?.parentSpanId).toBe(`${childSpan.traceId}-${childSpan.spanId}`);
        expect(greatGrandchildSpanInResult?.parentSpanId).toBe(`${grandchildSpan.traceId}-${grandchildSpan.spanId}`);
      });

      it('should sort parent spans by creation time (newest first)', async () => {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        // Create span hierarchies with different creation times
        const hierarchy1 = createSpanHierarchy('oldest-parent', ['child-1'], {
          createdAt: twoHoursAgo,
          startTime: twoHoursAgo.getTime(),
        });
        const hierarchy2 = createSpanHierarchy('middle-parent', ['child-2'], {
          createdAt: oneHourAgo,
          startTime: oneHourAgo.getTime(),
        });
        const hierarchy3 = createSpanHierarchy('newest-parent', ['child-3'], {
          createdAt: now,
          startTime: now.getTime(),
        });

        const hierarchies = [hierarchy1, hierarchy2, hierarchy3];

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        const result = await storage.getAiTracesPaginated({
          page: 0,
          perPage: 10,
        });

        // Should return all spans but pagination is based on parent spans
        expect(result.spans).toHaveLength(6); // 3 parent + 3 child spans
        expect(result.total).toBe(3); // Only parent spans count toward total

        // Parent spans should be ordered by creation time (newest first)
        const parentSpansInResult = result.spans.filter(s => s.parentSpanId === null);
        expect(parentSpansInResult).toHaveLength(3);
        expect(parentSpansInResult[0]?.name).toBe('newest-parent');
        expect(parentSpansInResult[1]?.name).toBe('middle-parent');
        expect(parentSpansInResult[2]?.name).toBe('oldest-parent');
      });

      it('should handle empty results gracefully', async () => {
        // Don't create any spans

        const result = await storage.getAiTracesPaginated({
          page: 0,
          perPage: 10,
        });

        expect(result.spans).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.page).toBe(0);
        expect(result.perPage).toBe(10);
        expect(result.hasMore).toBe(false);
      });

      it('should handle single page results', async () => {
        // Create only 3 span hierarchies (less than perPage)
        const hierarchies = createMultipleSpanHierarchies(3, {
          parentNamePrefix: 'single-page',
          childNames: ['child'],
        });

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        const result = await storage.getAiTracesPaginated({
          page: 0,
          perPage: 10,
        });

        expect(result.spans).toHaveLength(6); // 3 parent + 3 child spans
        expect(result.total).toBe(3);
        expect(result.page).toBe(0);
        expect(result.perPage).toBe(10);
        expect(result.hasMore).toBe(false); // No more pages
      });

      it('should handle complex filtering combinations', async () => {
        // Create span hierarchies with different characteristics
        const hierarchies = [
          createSpanHierarchy('prod-workflow-1', ['step1', 'step2'], {
            scope: { environment: 'prod', region: 'us-east' },
            attributes: { priority: 'high', team: 'backend' },
          }),
          createSpanHierarchy('prod-workflow-2', ['step1', 'step2'], {
            scope: { environment: 'prod', region: 'us-west' },
            attributes: { priority: 'medium', team: 'frontend' },
          }),
          createSpanHierarchy('dev-workflow-1', ['step1'], {
            scope: { environment: 'dev', region: 'us-east' },
            attributes: { priority: 'low', team: 'qa' },
          }),
          createSpanHierarchy('staging-workflow-1', ['step1'], {
            scope: { environment: 'staging', region: 'eu-west' },
            attributes: { priority: 'medium', team: 'devops' },
          }),
        ];

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        // Test complex filtering - filter by exact name 'prod-workflow-1' and priority 'high'
        const prodHighPrioritySpans = await storage.getAiTracesPaginated({
          filters: {
            name: 'prod-workflow-1',
            attributes: { priority: 'high' },
          },
          page: 0,
          perPage: 10,
        });

        expect(prodHighPrioritySpans.total).toBe(1); // Only 1 parent matches
        expect(prodHighPrioritySpans.spans).toHaveLength(3); // 1 parent + 2 children
        expect(
          prodHighPrioritySpans.spans.every(span => span.name === 'prod-workflow-1' || span.parentSpanId !== null),
        ).toBe(true);
      });

      it('should maintain span relationships across pagination', async () => {
        // Create 25 span hierarchies to test pagination boundaries
        const hierarchies = createMultipleSpanHierarchies(25, {
          parentNamePrefix: 'pagination-test',
          childNames: ['child-a', 'child-b', 'child-c'],
        });

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        // Test first page (10 items per page)
        const page1 = await storage.getAiTracesPaginated({
          page: 0,
          perPage: 10,
        });

        expect(page1.spans).toHaveLength(40); // 10 parent + 30 children
        expect(page1.total).toBe(25);
        expect(page1.hasMore).toBe(true);

        // Test second page
        const page2 = await storage.getAiTracesPaginated({
          page: 1,
          perPage: 10,
        });

        expect(page2.spans).toHaveLength(40); // 10 parent + 30 children
        expect(page2.total).toBe(25);
        expect(page2.hasMore).toBe(true);

        // Test last page
        const page3 = await storage.getAiTracesPaginated({
          page: 2,
          perPage: 10,
        });

        expect(page3.spans).toHaveLength(20); // 5 parent + 15 children (5 × 3)
        expect(page3.total).toBe(25);
        expect(page3.hasMore).toBe(false);

        // Verify that all spans in each page maintain their relationships
        for (const page of [page1, page2, page3]) {
          const parentSpans = page.spans.filter(s => s.parentSpanId === null);
          const childSpans = page.spans.filter(s => s.parentSpanId !== null);

          // Each child should have a parent in the same page
          for (const child of childSpans) {
            const hasParentInPage = parentSpans.some(
              parent => `${parent.traceId}-${parent.spanId}` === child.parentSpanId,
            );
            expect(hasParentInPage).toBe(true);
          }
        }
      });

      it('should filter by direct column fields', async () => {
        // Create spans with different span types and statuses
        const hierarchies = [
          createSpanHierarchy('agent-span', ['child'], {
            parentSpanType: 0, // Agent run
            childSpanType: 1, // LLM
          }),
          createSpanHierarchy('tool-span', ['child'], {
            parentSpanType: 2, // Tool
            childSpanType: 3, // Workflow
          }),
          createSpanHierarchy('llm-span', ['child'], {
            parentSpanType: 1, // LLM
            childSpanType: 0, // Agent run
          }),
        ];

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        // Filter by spanType - should find 1 parent span with spanType 0
        const agentSpans = await storage.getAiTracesPaginated({
          filters: {
            spanType: 0,
          },
          page: 0,
          perPage: 10,
        });
        expect(agentSpans.total).toBe(1); // 1 parent span with spanType 0
        expect(agentSpans.spans).toHaveLength(2); // 1 parent + 1 child span with spanType 0

        // Filter by multiple direct columns
        const agentAndToolSpans = await storage.getAiTracesPaginated({
          filters: {
            spanType: 0,
            // Add a custom filter to demonstrate flexibility
            traceId: hierarchies?.[0]?.parent.traceId,
          },
          page: 0,
          perPage: 10,
        });
        expect(agentAndToolSpans.total).toBe(1); // Only 1 parent span matches both criteria
        expect(agentAndToolSpans.spans).toHaveLength(2); // 1 parent + 1 child
      });

      it('should combine JSON and direct column filtering', async () => {
        // Create spans with different characteristics
        const hierarchies = [
          createSpanHierarchy('prod-agent', ['child'], {
            attributes: { team: 'backend' },
            parentSpanType: 0,
          }),
          createSpanHierarchy('prod-tool', ['child'], {
            attributes: { team: 'frontend' },
            parentSpanType: 2,
          }),
          createSpanHierarchy('dev-agent', ['child'], {
            attributes: { team: 'backend' },
            parentSpanType: 0,
          }),
        ];

        // Create all spans
        for (const { parent, children } of hierarchies) {
          await storage.createAiSpan(parent);

          for (const child of children) {
            (child as any).parentSpanId = `${parent.traceId}-${parent.spanId}`;
            await storage.createAiSpan(child);
          }
        }

        // Filter by attributes (JSON field) and spanType (direct column)
        const backendAgents = await storage.getAiTracesPaginated({
          filters: {
            attributes: { team: 'backend' },
            spanType: 0,
          },
          page: 0,
          perPage: 10,
        });
        expect(backendAgents.total).toBe(2);
        expect(backendAgents.spans).toHaveLength(4); // 2 parents + 2 children
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
        const spans = [createSampleAgentRunSpan('batch-update-1'), createSampleAgentRunSpan('batch-update-2')];

        // Create spans first
        for (const span of spans) {
          await storage.createAiSpan(span);
        }

        const updates = [
          {
            id: `${spans[0]?.traceId}-${spans[0]?.spanId}`,
            updates: { name: 'updated-1', metadata: { status: 'completed' } },
          },
          {
            id: `${spans[1]?.traceId}-${spans[1]?.spanId}`,
            updates: { name: 'updated-2', metadata: { status: 'completed' } },
          },
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
        const largeSpans = Array.from({ length: 100 }, (_, i) => createSampleAgentRunSpan(`large-span-${i}`));

        // Create spans in smaller batches to avoid overwhelming the storage
        const batchSize = 20;
        for (let i = 0; i < largeSpans.length; i += batchSize) {
          const batch = largeSpans.slice(i, i + batchSize);
          await storage.batchAiSpanCreate({ records: batch });
        }

        const result = await storage.getAiTracesPaginated({
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
