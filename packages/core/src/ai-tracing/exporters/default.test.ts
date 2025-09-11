import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AISpanType, AITracingEventType } from '../types';
import type { LLMGenerationAttributes, WorkflowStepAttributes, AITracingEvent, AnyExportedAISpan } from '../types';
import { DefaultExporter } from './default';

// Mock Mastra and logger
const mockMastra = {
  getStorage: vi.fn(),
} as any;

const mockLogger = {
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as any;

describe('DefaultExporter', () => {
  describe('serializeAttributes', () => {
    it('should serialize LLM generation attributes with dates', () => {
      const exporter = new DefaultExporter({}, mockLogger);

      const mockSpan = {
        id: 'span-1',
        type: AISpanType.LLM_GENERATION,
        attributes: {
          model: 'gpt-4',
          provider: 'openai',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
          parameters: {
            temperature: 0.7,
            maxTokens: 1000,
          },
        } as LLMGenerationAttributes,
      } as any;

      const result = (exporter as any).serializeAttributes(mockSpan);

      expect(result).toEqual({
        model: 'gpt-4',
        provider: 'openai',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        parameters: {
          temperature: 0.7,
          maxTokens: 1000,
        },
      });
    });

    it('should serialize workflow step attributes', () => {
      const exporter = new DefaultExporter({}, mockLogger);

      const mockSpan = {
        id: 'span-2',
        type: AISpanType.WORKFLOW_STEP,
        attributes: {
          stepId: 'step-1',
          status: 'success',
        } as WorkflowStepAttributes,
      } as any;

      const result = (exporter as any).serializeAttributes(mockSpan);

      expect(result).toEqual({
        stepId: 'step-1',
        status: 'success',
      });
    });

    it('should handle Date objects in attributes', () => {
      const exporter = new DefaultExporter({}, mockLogger);
      const testDate = new Date('2023-12-01T10:00:00Z');

      const mockSpan = {
        id: 'span-3',
        type: AISpanType.WORKFLOW_SLEEP,
        attributes: {
          untilDate: testDate,
          durationMs: 5000,
        },
      } as any;

      const result = (exporter as any).serializeAttributes(mockSpan);

      expect(result).toEqual({
        untilDate: '2023-12-01T10:00:00.000Z',
        durationMs: 5000,
      });
    });

    it('should return null for undefined attributes', () => {
      const exporter = new DefaultExporter({}, mockLogger);

      const mockSpan = {
        id: 'span-4',
        type: AISpanType.GENERIC,
        attributes: undefined,
      } as any;

      const result = (exporter as any).serializeAttributes(mockSpan);

      expect(result).toBeNull();
    });

    it('should handle serialization errors gracefully', () => {
      const exporter = new DefaultExporter({}, mockLogger);

      // Create an object that will cause JSON.stringify to throw
      const circularObj = {} as any;
      circularObj.self = circularObj;

      const mockSpan = {
        id: 'span-5',
        type: AISpanType.TOOL_CALL,
        attributes: {
          circular: circularObj,
        },
      } as any;

      const result = (exporter as any).serializeAttributes(mockSpan);

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to serialize span attributes, storing as null',
        expect.objectContaining({
          spanId: 'span-5',
          spanType: AISpanType.TOOL_CALL,
        }),
      );
    });
  });

  describe('Batching functionality', () => {
    let mockStorage: any;
    let timers: any[];

    beforeEach(() => {
      vi.clearAllMocks();
      timers = [];

      // Mock setTimeout and clearTimeout to track timers
      // For flush timer tests, we DON'T want to execute immediately
      vi.spyOn(global, 'setTimeout').mockImplementation(((fn: any, delay: any) => {
        const id = Math.random();
        timers.push({ id, fn, delay });
        // DON'T execute automatically - let tests control execution
        return id;
      }) as any);

      vi.spyOn(global, 'clearTimeout').mockImplementation(((id: any) => {
        const index = timers.findIndex(t => t.id === id);
        if (index !== -1) timers.splice(index, 1);
      }) as any);

      mockStorage = {
        aiTracingStrategy: {
          preferred: 'batch-with-updates',
          supported: ['realtime', 'batch-with-updates', 'insert-only'],
        },
        batchCreateAISpans: vi.fn().mockResolvedValue(undefined),
        batchUpdateAISpans: vi.fn().mockResolvedValue(undefined),
        createAISpan: vi.fn().mockResolvedValue(undefined),
        updateAISpan: vi.fn().mockResolvedValue(undefined),
        constructor: { name: 'MockStorage' },
      };

      mockMastra.getStorage.mockReturnValue(mockStorage);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('Strategy resolution', () => {
      it('should auto-select storage preferred strategy', async () => {
        const exporter = new DefaultExporter({}, mockLogger);
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Strategy should be initialized when init() is called
        exporter.init();

        expect(mockLogger.info).toHaveBeenCalledWith(
          'AI tracing exporter initialized',
          expect.objectContaining({
            strategy: 'batch-with-updates',
            source: 'auto',
            storageAdapter: 'MockStorage',
          }),
        );
      });

      it('should use user-specified strategy when supported', async () => {
        const exporter = new DefaultExporter({ strategy: 'realtime' }, mockLogger);
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Strategy should be initialized when init() is called
        exporter.init();

        expect(mockLogger.info).toHaveBeenCalledWith(
          'AI tracing exporter initialized',
          expect.objectContaining({
            strategy: 'realtime',
            source: 'user',
          }),
        );
      });

      it('should fallback to storage preferred when user strategy not supported', async () => {
        mockStorage.aiTracingStrategy.supported = ['batch-with-updates'];

        const exporter = new DefaultExporter({ strategy: 'realtime' }, mockLogger);
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Strategy should be initialized when init() is called, with warning
        exporter.init();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'User-specified AI tracing strategy not supported by storage adapter, falling back to auto-selection',
          expect.objectContaining({
            userStrategy: 'realtime',
            fallbackStrategy: 'batch-with-updates',
          }),
        );
      });

      it('should throw error if init() called before __registerMastra()', () => {
        const exporter = new DefaultExporter({}, mockLogger);

        expect(() => exporter.init()).toThrow('DefaultExporter: init() called before __registerMastra()');
      });

      it('should log error if storage not available during init()', () => {
        const mockMastraWithoutStorage = {
          getStorage: vi.fn().mockReturnValue(null),
        } as any;

        const exporter = new DefaultExporter({}, mockLogger);
        exporter.__registerMastra(mockMastraWithoutStorage);

        // Should not throw, but log error instead
        expect(() => exporter.init()).not.toThrow();

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'DefaultExporter disabled: Storage not available. Traces will not be persisted.',
        );
      });
    });

    describe('Realtime strategy', () => {
      it('should process events immediately', async () => {
        const exporter = new DefaultExporter({ strategy: 'realtime' }, mockLogger);
        exporter.__registerMastra(mockMastra);
        exporter.init();
        const mockEvent = createMockEvent(AITracingEventType.SPAN_STARTED);

        await exporter.exportEvent(mockEvent);

        expect(mockStorage.createAISpan).toHaveBeenCalledWith(
          expect.objectContaining({
            traceId: 'trace-1',
            spanId: 'span-1',
          }),
        );
      });
    });

    describe('Batch-with-updates strategy', () => {
      it('should buffer events and flush when batch size reached', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxBatchSize: 2,
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        const event1 = createMockEvent(AITracingEventType.SPAN_STARTED, 'trace-1', 'span-1');
        const event2 = createMockEvent(AITracingEventType.SPAN_STARTED, 'trace-1', 'span-2');

        await exporter.exportEvent(event1);
        // First event should schedule timer but not flush yet
        expect(mockStorage.batchCreateAISpans).not.toHaveBeenCalled();

        await exporter.exportEvent(event2);

        // Wait for the async flush to complete (it's called in a fire-and-forget manner)
        await new Promise(resolve => setImmediate(resolve));

        // Should flush when batch size reached
        expect(mockStorage.batchCreateAISpans).toHaveBeenCalledWith({
          records: expect.arrayContaining([
            expect.objectContaining({ spanId: 'span-1' }),
            expect.objectContaining({ spanId: 'span-2' }),
          ]),
        });
      });

      it('should handle span updates with sequence numbers', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxBatchSize: 10,
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Add span create first
        const createEvent = createMockEvent(AITracingEventType.SPAN_STARTED, 'trace-1', 'span-1');
        await exporter.exportEvent(createEvent);

        // Add updates
        const updateEvent1 = createMockEvent(AITracingEventType.SPAN_UPDATED, 'trace-1', 'span-1');
        const updateEvent2 = createMockEvent(AITracingEventType.SPAN_ENDED, 'trace-1', 'span-1');

        await exporter.exportEvent(updateEvent1);
        await exporter.exportEvent(updateEvent2);

        // Manually trigger flush
        await (exporter as any).flush();

        expect(mockStorage.batchUpdateAISpans).toHaveBeenCalledWith({
          records: expect.arrayContaining([
            expect.objectContaining({
              spanId: 'span-1',
              sequenceNumber: 1,
            }),
            expect.objectContaining({
              spanId: 'span-1',
              sequenceNumber: 2,
            }),
          ]),
        });
      });

      it('should handle out-of-order updates', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Send update without create first
        const updateEvent = createMockEvent(AITracingEventType.SPAN_UPDATED, 'trace-1', 'span-1');
        await exporter.exportEvent(updateEvent);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Out-of-order span update detected - skipping event',
          expect.objectContaining({
            spanId: 'span-1',
            traceId: 'trace-1',
            eventType: AITracingEventType.SPAN_UPDATED,
          }),
        );
      });

      it('should handle event-type spans that only emit SPAN_ENDED', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxBatchSize: 1, // Set to 1 to trigger immediate flush
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Event-type spans only emit SPAN_ENDED (no SPAN_STARTED)
        const eventSpan = createMockEvent(AITracingEventType.SPAN_ENDED, 'trace-1', 'event-1', true);
        await exporter.exportEvent(eventSpan);

        // Wait for async flush to complete
        await new Promise(resolve => setImmediate(resolve));

        // Should create the span record (not treat as out-of-order)
        expect(mockStorage.batchCreateAISpans).toHaveBeenCalledWith({
          records: expect.arrayContaining([
            expect.objectContaining({
              spanId: 'event-1',
              traceId: 'trace-1',
            }),
          ]),
        });

        // Should not log out-of-order warning
        expect(mockLogger.warn).not.toHaveBeenCalledWith(
          'Out-of-order span update detected - skipping event',
          expect.anything(),
        );
      });
    });

    describe('Insert-only strategy', () => {
      it('should only process SPAN_ENDED events', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'insert-only',
            maxBatchSize: 1, // Set to 1 to trigger immediate flush
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        const startEvent = createMockEvent(AITracingEventType.SPAN_STARTED, 'trace-1', 'span-1');
        const updateEvent = createMockEvent(AITracingEventType.SPAN_UPDATED, 'trace-1', 'span-1');
        const endEvent = createMockEvent(AITracingEventType.SPAN_ENDED, 'trace-1', 'span-1');

        await exporter.exportEvent(startEvent);
        await exporter.exportEvent(updateEvent);
        await exporter.exportEvent(endEvent);

        // Only the end event should trigger a batch
        expect(mockStorage.batchCreateAISpans).toHaveBeenCalledWith({
          records: expect.arrayContaining([expect.objectContaining({ spanId: 'span-1' })]),
        });

        // Should have been called only once (for the end event)
        expect(mockStorage.batchCreateAISpans).toHaveBeenCalledTimes(1);
        expect(mockStorage.batchUpdateAISpans).not.toHaveBeenCalled();
      });
    });

    describe('Timer-based flushing', () => {
      it('should schedule flush for first event', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxBatchWaitMs: 1000,
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        const mockEvent = createMockEvent(AITracingEventType.SPAN_STARTED);
        await exporter.exportEvent(mockEvent);

        // Should have scheduled a timer
        expect(timers).toHaveLength(1);
        expect(timers[0].delay).toBe(1000);
      });

      it('should clear timer when flush triggered by size', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxBatchSize: 2,
            maxBatchWaitMs: 1000,
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // First event should schedule timer
        const mockEvent1 = createMockEvent(AITracingEventType.SPAN_STARTED, 'trace-1', 'span-1');
        await exporter.exportEvent(mockEvent1);

        // Timer should be scheduled
        expect(timers).toHaveLength(1);

        // Second event should trigger flush and clear timer
        const mockEvent2 = createMockEvent(AITracingEventType.SPAN_STARTED, 'trace-1', 'span-2');
        await exporter.exportEvent(mockEvent2);

        // Timer should be cleared after size-based flush
        expect(global.clearTimeout).toHaveBeenCalled();
      });
    });

    describe('Retry logic', () => {
      it('should retry on storage failures with exponential backoff', async () => {
        // Mock Promise-based delay instead of real timeout
        vi.spyOn(global, 'setTimeout').mockImplementation(((fn: any) => {
          Promise.resolve().then(fn); // Execute immediately in next tick
          return 123 as any;
        }) as any);

        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxRetries: 2,
            retryDelayMs: 100,
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Mock storage failure then success
        mockStorage.batchCreateAISpans
          .mockRejectedValueOnce(new Error('Storage error'))
          .mockResolvedValueOnce(undefined);

        const mockEvent = createMockEvent(AITracingEventType.SPAN_STARTED);
        await exporter.exportEvent(mockEvent);

        // Manually trigger flush and wait for retry
        await (exporter as any).flush();
        await new Promise(resolve => setTimeout(resolve, 10)); // Allow retry to complete

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Batch flush failed, retrying',
          expect.objectContaining({
            attempt: 1,
            maxRetries: 2,
            nextRetryInMs: 100,
          }),
        );
      });

      it('should drop batch after max retries exceeded', async () => {
        // Mock setTimeout to resolve immediately for this test
        vi.spyOn(global, 'setTimeout').mockImplementation(((fn: any) => {
          setImmediate(fn);
          return 123 as any;
        }) as any);

        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxRetries: 1, // Test with 1 retry
            retryDelayMs: 1, // Very short delay for fast test
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        // Mock persistent storage failure
        mockStorage.batchCreateAISpans.mockRejectedValue(new Error('Persistent error'));

        const mockEvent = createMockEvent(AITracingEventType.SPAN_STARTED);
        await exporter.exportEvent(mockEvent);

        // Manually trigger flush and wait for completion
        await (exporter as any).flush();

        // Give time for setImmediate to execute retry logic
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));

        // Verify the error was logged after all retries failed
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Batch flush failed after all retries, dropping batch',
          expect.objectContaining({
            finalAttempt: 2, // Initial attempt + 1 retry = 2 attempts total
            maxRetries: 1,
            droppedBatchSize: 1,
          }),
        );
      });
    });

    describe('Shutdown', () => {
      it('should flush remaining events on shutdown', async () => {
        const exporter = new DefaultExporter(
          {
            strategy: 'batch-with-updates',
            maxBatchSize: 10, // Ensure single event doesn't trigger auto-flush
          },
          mockLogger,
        );
        exporter.__registerMastra(mockMastra);
        exporter.init();

        const mockEvent = createMockEvent(AITracingEventType.SPAN_STARTED);
        await exporter.exportEvent(mockEvent);

        // Wait for any async operations to settle
        await new Promise(resolve => setImmediate(resolve));

        // Should have events in buffer (not auto-flushed due to higher batch size)
        expect((exporter as any).buffer.totalSize).toBe(1);

        await exporter.shutdown();

        expect(mockLogger.info).toHaveBeenCalledWith('Flushing remaining events on shutdown', { remainingEvents: 1 });

        expect(mockStorage.batchCreateAISpans).toHaveBeenCalled();
      });
    });

    function createMockEvent(
      type: AITracingEventType,
      traceId = 'trace-1',
      spanId = 'span-1',
      isEvent = false,
    ): AITracingEvent {
      return {
        type,
        exportedSpan: {
          id: spanId,
          traceId,
          type: AISpanType.GENERIC,
          name: 'test-span',
          startTime: new Date(),
          endTime: type === AITracingEventType.SPAN_ENDED ? new Date() : undefined,
          isEvent,
          attributes: { test: 'value' },
          metadata: undefined,
          input: 'test input',
          output: type === AITracingEventType.SPAN_ENDED ? 'test output' : undefined,
        } as any as AnyExportedAISpan,
      };
    }
  });
});
