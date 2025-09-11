import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MastraError } from '../error';
import { clearAITracingRegistry } from './registry';
import { DefaultAITracing } from './tracers';
import type { AITracingEvent, AITracingExporter, LLMGenerationAttributes, AISpan, AITracing, ExportedAISpan } from './types';
import { AISpanType, SamplingStrategyType, AITracingEventType } from './types';

// Custom matchers for OpenTelemetry ID validation
expect.extend({
  toBeValidSpanId(received: string) {
    const spanIdRegex = /^[a-f0-9]{16}$/;
    const pass = spanIdRegex.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid OpenTelemetry span ID (64-bit, 16 hex chars)`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid OpenTelemetry span ID (64-bit, 16 hex chars)`,
        pass: false,
      };
    }
  },

  toBeValidTraceId(received: string) {
    const traceIdRegex = /^[a-f0-9]{32}$/;
    const pass = traceIdRegex.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid OpenTelemetry trace ID (128-bit, 32 hex chars)`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid OpenTelemetry trace ID (128-bit, 32 hex chars)`,
        pass: false,
      };
    }
  },
});

// TypeScript declarations for custom matchers
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeValidSpanId(): T;
    toBeValidTraceId(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeValidSpanId(): any;
    toBeValidTraceId(): any;
  }
}

// Mock console for exporter tests
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

// Test exporter for capturing events
class TestExporter implements AITracingExporter {
  name = 'test-exporter';
  events: AITracingEvent[] = [];

  async exportEvent(event: AITracingEvent): Promise<void> {
    this.events.push(event);
  }

  async shutdown(): Promise<void> {
    // no-op
  }

  reset(): void {
    this.events = [];
  }
}

describe('AI Tracing', () => {
  let testExporter: TestExporter;

  beforeEach(() => {
    vi.resetAllMocks();

    // Clear registry
    clearAITracingRegistry();

    // Reset test exporter
    testExporter = new TestExporter();
  });

  describe('DefaultAITracing', () => {
    it('should create and start spans with type safety', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      // Agent span
      const agentSpan = tracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
          instructions: 'Test instructions',
          maxSteps: 5,
        },
      });

      expect(agentSpan.id).toBeValidSpanId();
      expect(agentSpan.name).toBe('test-agent');
      expect(agentSpan.type).toBe(AISpanType.AGENT_RUN);
      expect(agentSpan.attributes?.agentId).toBe('agent-123');
      expect(agentSpan.startTime).toBeInstanceOf(Date);
      expect(agentSpan.endTime).toBeUndefined();
      expect(agentSpan.traceId).toBeValidTraceId();
    });

    it('should create child spans with different types', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      const agentSpan = tracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'parent-agent',
        attributes: { agentId: 'agent-123' },
      });

      const toolSpan = agentSpan.createChildSpan({
        type: AISpanType.TOOL_CALL,
        name: 'child-tool',
        attributes: {
          toolId: 'tool-456',
          success: true,
        },
      });

      expect(toolSpan.id).toBeValidSpanId();
      expect(toolSpan.type).toBe(AISpanType.TOOL_CALL);
      expect(toolSpan.attributes?.toolId).toBe('tool-456');
      expect(toolSpan.traceId).toBe(agentSpan.traceId); // Child spans inherit trace ID
    });

    it('should correctly set parent relationships and isRootSpan property', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      // Create root span
      const rootSpan = tracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'root-agent',
        attributes: { agentId: 'agent-123' },
      });

      // Root span should have no parent and isRootSpan should be true
      expect(rootSpan.parent).toBeUndefined();
      expect(rootSpan.isRootSpan).toBe(true);

      // Create child span
      const childSpan = rootSpan.createChildSpan({
        type: AISpanType.LLM_GENERATION,
        name: 'child-llm',
        attributes: {
          model: 'gpt-4',
          provider: 'openai',
        },
      });

      // Child span should have parent and isRootSpan should be false
      expect(childSpan.parent).toBe(rootSpan);
      expect(childSpan.isRootSpan).toBe(false);

      // Create grandchild span
      const grandchildSpan = childSpan.createChildSpan({
        type: AISpanType.TOOL_CALL,
        name: 'grandchild-tool',
        attributes: {
          toolId: 'calculator',
        },
      });

      // Grandchild should have correct parent and isRootSpan should be false
      expect(grandchildSpan.parent).toBe(childSpan);
      expect(grandchildSpan.isRootSpan).toBe(false);
    });

    it('should maintain consistent traceId across span hierarchy', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      // Create root span
      const rootSpan = tracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'root-agent',
        attributes: { agentId: 'agent-123' },
      });

      // Create child span
      const childSpan = rootSpan.createChildSpan({
        type: AISpanType.LLM_GENERATION,
        name: 'child-llm',
        attributes: {
          model: 'gpt-4',
          provider: 'openai',
        },
      });

      // Create grandchild span
      const grandchildSpan = childSpan.createChildSpan({
        type: AISpanType.TOOL_CALL,
        name: 'grandchild-tool',
        attributes: {
          toolId: 'calculator',
        },
      });

      // All spans should have the same traceId
      expect(rootSpan.traceId).toBeValidTraceId();
      expect(childSpan.traceId).toBe(rootSpan.traceId);
      expect(grandchildSpan.traceId).toBe(rootSpan.traceId);

      // But different span IDs
      expect(rootSpan.id).not.toBe(childSpan.id);
      expect(childSpan.id).not.toBe(grandchildSpan.id);
      expect(rootSpan.id).not.toBe(grandchildSpan.id);
    });

    it('should emit events throughout span lifecycle', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.LLM_GENERATION,
        name: 'test-llm',
        attributes: { model: 'gpt-4', provider: 'openai' },
      });

      // Should emit span_started
      expect(testExporter.events).toHaveLength(1);
      expect(testExporter.events[0].type).toBe(AITracingEventType.SPAN_STARTED);
      expect(testExporter.events[0].exportedSpan.id).toBe(span.id);

      // Update span - cast to LLM attributes type for usage field
      span.update({ attributes: { usage: { totalTokens: 100 } } });

      // Should emit span_updated
      expect(testExporter.events).toHaveLength(2);
      expect(testExporter.events[1].type).toBe(AITracingEventType.SPAN_UPDATED);
      expect((testExporter.events[1].exportedSpan.attributes as LLMGenerationAttributes).usage?.totalTokens).toBe(100);

      // End span
      span.end({ attributes: { usage: { totalTokens: 150 } } });

      // Should emit span_ended
      expect(testExporter.events).toHaveLength(3);
      expect(testExporter.events[2].type).toBe(AITracingEventType.SPAN_ENDED);
      expect(testExporter.events[2].exportedSpan.endTime).toBeInstanceOf(Date);
      expect((testExporter.events[2].exportedSpan.attributes as LLMGenerationAttributes).usage?.totalTokens).toBe(150);
    });

    it('should handle errors with default endSpan=true', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.TOOL_CALL,
        name: 'error-tool',
        attributes: { toolId: 'failing-tool' },
      });

      const error = new MastraError({
        id: 'TOOL_ERROR',
        text: 'Tool failed',
        domain: 'TOOL',
        category: 'SYSTEM',
        details: { reason: 'timeout' },
      });

      // Error should end span by default
      span.error({ error });

      expect(span.endTime).toBeInstanceOf(Date);
      expect(span.errorInfo?.message).toBe('Tool failed');
      expect(span.errorInfo?.id).toBe('TOOL_ERROR');
      expect(span.errorInfo?.category).toBe('SYSTEM');

      // Should emit span_ended
      expect(testExporter.events).toHaveLength(2); // start + end
      expect(testExporter.events[1].type).toBe(AITracingEventType.SPAN_ENDED);
    });

    it('should handle errors with explicit endSpan=false', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.TOOL_CALL,
        name: 'recoverable-tool',
        attributes: { toolId: 'retry-tool' },
      });

      const error = new Error('Recoverable error');

      // Error should NOT end span when explicitly set to false
      span.error({ error, endSpan: false });

      expect(span.endTime).toBeUndefined();
      expect(span.errorInfo?.message).toBe('Recoverable error');

      // Should emit span_updated (not ended)
      expect(testExporter.events).toHaveLength(2); // start + update
      expect(testExporter.events[1].type).toBe(AITracingEventType.SPAN_UPDATED);
    });
  });

  describe('Sampling Strategies', () => {
    it('should always sample with ALWAYS strategy', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-span',
        attributes: {},
      });

      expect(span.id).toBeValidSpanId();
      expect(testExporter.events).toHaveLength(1);
    });

    it('should never sample with NEVER strategy', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.NEVER },
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-span',
        attributes: {},
      });

      expect(span.id).toBe('no-op'); // No-op span created
      expect(testExporter.events).toHaveLength(0);
    });

    it('should sample based on ratio', () => {
      // Mock Math.random to control sampling
      const mockRandom = vi.spyOn(Math, 'random');

      // Test probability = 0.5
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.RATIO, probability: 0.5 },
        exporters: [testExporter],
      });

      // First call: random = 0.3 < 0.5 -> should sample
      mockRandom.mockReturnValueOnce(0.3);
      const span1 = tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-1',
        attributes: {},
      });
      expect(span1.id).toBeValidSpanId();

      // Second call: random = 0.8 > 0.5 -> should not sample
      mockRandom.mockReturnValueOnce(0.8);
      const span2 = tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-2',
        attributes: {},
      });
      expect(span2.id).toBe('no-op');

      mockRandom.mockRestore();
    });

    it('should use custom sampler', () => {
      const shouldSample = (): boolean => {
        return false;
      };

      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.CUSTOM, sampler: shouldSample },
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-span',
      });

      expect(span.id).toBe('no-op'); // Custom sampler rejected
      expect(testExporter.events).toHaveLength(0);
    });

    it('should handle invalid ratio probability', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.RATIO, probability: 1.5 }, // Invalid > 1
        exporters: [testExporter],
      });

      const span = tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-span',
        attributes: {},
      });

      // Should default to no sampling for invalid probability
      expect(span.id).toBe('no-op');
    });

    it('should handle parent relationships correctly in NoOp spans', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.NEVER }, // Force NoOp spans
        exporters: [testExporter],
      });

      // Create root NoOp span
      const rootSpan = tracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'no-op-root',
        attributes: { agentId: 'agent-123' },
      });

      // Should be NoOp span with correct properties
      expect(rootSpan.id).toBe('no-op');
      expect(rootSpan.parent).toBeUndefined();
      expect(rootSpan.isRootSpan).toBe(true);

      // Create child NoOp span
      const childSpan = rootSpan.createChildSpan({
        type: AISpanType.TOOL_CALL,
        name: 'no-op-child',
        attributes: { toolId: 'tool-456' },
      });

      // Child should also be NoOp with correct parent relationship
      expect(childSpan.id).toBe('no-op');
      expect(childSpan.parent).toBe(rootSpan);
      expect(childSpan.isRootSpan).toBe(false);

      // No events should be emitted for NoOp spans
      expect(testExporter.events).toHaveLength(0);
    });
  });

  describe('Exporter Behavior', () => {
    it('should handle exporter errors gracefully', async () => {
      const failingExporter: AITracingExporter = {
        name: 'failing-exporter',
        exportEvent: vi.fn().mockRejectedValue(new Error('Export failed')),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [failingExporter, testExporter], // One fails, one succeeds
      });

      tracing.startSpan({
        type: AISpanType.GENERIC,
        name: 'test-span',
        attributes: {},
      });

      // Wait for async export to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should continue with other exporters despite failure
      expect(testExporter.events).toHaveLength(1);
      expect(failingExporter.exportEvent).toHaveBeenCalled();
    });

    it('should shutdown all components', async () => {
      const mockExporter = {
        name: 'mock-exporter',
        exportEvent: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };

      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [mockExporter],
      });

      await tracing.shutdown();

      expect(mockExporter.shutdown).toHaveBeenCalled();
    });
  });

  describe('Type Safety', () => {
    it('should enforce correct attribute types for different span types', () => {
      const tracing = new DefaultAITracing({
        serviceName: 'test-tracing',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });

      // Agent attributes
      const agentSpan = tracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'agent-test',
        attributes: {
          agentId: 'agent-123',
          instructions: 'Test agent',
          maxSteps: 10,
        },
      });

      expect(agentSpan.attributes?.agentId).toBe('agent-123');

      // LLM attributes
      const llmSpan = tracing.startSpan({
        type: AISpanType.LLM_GENERATION,
        name: 'llm-test',
        attributes: {
          model: 'gpt-4',
          provider: 'openai',
          usage: { totalTokens: 100 },
          streaming: false,
        },
      });

      expect(llmSpan.attributes?.model).toBe('gpt-4');

      // Tool attributes
      const toolSpan = tracing.startSpan({
        type: AISpanType.TOOL_CALL,
        name: 'tool-test',
        attributes: {
          toolId: 'calculator',
          success: true,
        },
      });

      expect(toolSpan.attributes?.toolId).toBe('calculator');
    });
  });

  describe('Event Spans', () => {
    let aiTracing: AITracing;
    let testExporter: TestExporter;

    beforeEach(() => {
      testExporter = new TestExporter();
      aiTracing = new DefaultAITracing({
        serviceName: 'test-event-spans',
        name: 'test-instance',
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [testExporter],
      });
    });

    it('should create event spans with isEvent=true and no input', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      const eventSpan = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'llm chunk: text-delta',
        output: 'Hello world',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      // Event span should have isEvent=true
      expect(eventSpan.isEvent).toBe(true);

      // Event span should not have input (only output)
      expect(eventSpan.input).toBeUndefined();
      expect(eventSpan.output).toBe('Hello world');

      // Event span should have proper attributes
      expect(eventSpan.attributes?.chunkType).toBe('text-delta');

      // Event span should be properly linked to parent
      expect(eventSpan.parent).toBe(rootSpan);
      expect(eventSpan.traceId).toBe(rootSpan.traceId);

      rootSpan.end();
    });

    it('should emit only span_ended event on creation (no span_started)', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      // Clear events from root span creation
      testExporter.events = [];

      const eventSpan = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'llm chunk: text-delta',
        output: 'Hello',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      // Should have emitted exactly one event: span_ended
      expect(testExporter.events).toHaveLength(1);
      expect(testExporter.events[0].type).toBe(AITracingEventType.SPAN_ENDED);
      expect(testExporter.events[0].exportedSpan).toBe(eventSpan);

      rootSpan.end();
    });

    it('should have endTime undefined for event spans', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      const eventSpan = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'llm chunk: text-delta',
        output: 'Hello',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      // Event spans should not have endTime (event occurs at startTime)
      expect(eventSpan.endTime).toBeUndefined();
      expect(eventSpan.startTime).toBeDefined();

      rootSpan.end();
    });

    it('should never emit span_started or span_updated events for event spans', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      // Clear initial events
      testExporter.events = [];

      const eventSpan = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'llm chunk: text-delta',
        output: 'Hello',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      // Try to call update on event span (should be no-op)
      eventSpan.update({
        output: 'Updated hello',
        attributes: { chunkType: 'updated-delta' },
      });

      // Try to call end on event span (should be no-op)
      eventSpan.end({ output: 'Final hello' });

      // Should still only have the initial span_ended event
      expect(testExporter.events).toHaveLength(1);
      expect(testExporter.events[0].type).toBe(AITracingEventType.SPAN_ENDED);

      // Event should not include any span_started or span_updated events
      const eventTypes = testExporter.events.map(e => e.type);
      expect(eventTypes).not.toContain(AITracingEventType.SPAN_STARTED);
      expect(eventTypes).not.toContain(AITracingEventType.SPAN_UPDATED);

      rootSpan.end();
    });

    it('should support all span types as event spans', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      // Test different span types as events
      const llmChunkEvent = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'llm chunk event',
        output: 'chunk data',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      const toolCallEvent = rootSpan.createEventSpan({
        type: AISpanType.TOOL_CALL,
        name: 'tool call event',
        output: { result: 'success' },
        attributes: {
          toolId: 'calculator',
          success: true,
        },
      });

      const genericEvent = rootSpan.createEventSpan({
        type: AISpanType.GENERIC,
        name: 'generic event',
        output: 'generic output',
        attributes: {},
      });

      // All should be event spans
      expect(llmChunkEvent.isEvent).toBe(true);
      expect(toolCallEvent.isEvent).toBe(true);
      expect(genericEvent.isEvent).toBe(true);

      // All should have proper type safety
      expect(llmChunkEvent.type).toBe(AISpanType.LLM_CHUNK);
      expect(toolCallEvent.type).toBe(AISpanType.TOOL_CALL);
      expect(genericEvent.type).toBe(AISpanType.GENERIC);

      rootSpan.end();
    });

    it('should maintain proper span hierarchy with event spans', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      const llmSpan = rootSpan.createChildSpan({
        type: AISpanType.LLM_GENERATION,
        name: 'llm generation',
        attributes: {
          model: 'gpt-4',
          streaming: true,
        },
      });

      const eventSpan1 = llmSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'chunk 1',
        output: 'Hello',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      const eventSpan2 = llmSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'chunk 2',
        output: ' world',
        attributes: {
          chunkType: 'text-delta',
        },
      });

      // Event spans should have llmSpan as parent
      expect(eventSpan1.parent).toBe(llmSpan);
      expect(eventSpan2.parent).toBe(llmSpan);

      // All spans should share the same traceId
      expect(eventSpan1.traceId).toBe(rootSpan.traceId);
      expect(eventSpan2.traceId).toBe(rootSpan.traceId);
      expect(llmSpan.traceId).toBe(rootSpan.traceId);

      // Event spans should not be root spans
      expect(eventSpan1.isRootSpan).toBe(false);
      expect(eventSpan2.isRootSpan).toBe(false);

      // Only rootSpan should be root
      expect(rootSpan.isRootSpan).toBe(true);
      expect(llmSpan.isRootSpan).toBe(false);

      llmSpan.end();
      rootSpan.end();
    });

    it('should handle metadata correctly in event spans', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      const eventSpan = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'llm chunk with metadata',
        output: 'Hello world',
        attributes: {
          chunkType: 'text-delta',
        },
        metadata: {
          sequenceNumber: 1,
          tokenCount: 2,
          model: 'gpt-4',
        },
      });

      // Event span should have metadata
      expect(eventSpan.metadata).toEqual({
        sequenceNumber: 1,
        tokenCount: 2,
        model: 'gpt-4',
      });

      rootSpan.end();
    });

    it('should preserve event span properties in exports', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      // Clear initial events
      testExporter.events = [];

      rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'exported event span',
        output: { text: 'Hello', chunkSize: 5 },
        attributes: {
          chunkType: 'text-delta',
          sequenceNumber: 42,
        },
        metadata: {
          model: 'gpt-4',
          temperature: 0.7,
        },
      });

      // Should have exported the event span
      expect(testExporter.events).toHaveLength(1);
      const exportedEvent = testExporter.events[0];
      const exportedSpan = exportedEvent.exportedSpan as ExportedAISpan<AISpanType.LLM_CHUNK>;

      // Verify exported span properties
      expect(exportedSpan.isEvent).toBe(true);
      expect(exportedSpan.type).toBe(AISpanType.LLM_CHUNK);
      expect(exportedSpan.name).toBe('exported event span');
      expect(exportedSpan.output).toEqual({ text: 'Hello', chunkSize: 5 });
      expect(exportedSpan.input).toBeUndefined();
      expect(exportedSpan.endTime).toBeUndefined();
      expect(exportedSpan.attributes?.chunkType).toBe('text-delta');
      expect(exportedSpan.attributes?.sequenceNumber).toBe(42);
      expect(exportedSpan.metadata?.model).toBe('gpt-4');
      expect(exportedSpan.metadata?.temperature).toBe(0.7);

      rootSpan.end();
    });

    it('should handle error scenarios gracefully for event spans', () => {
      const rootSpan = aiTracing.startSpan({
        type: AISpanType.AGENT_RUN,
        name: 'test-agent',
        attributes: {
          agentId: 'agent-123',
        },
      });

      // Create event span with error
      const eventSpan = rootSpan.createEventSpan({
        type: AISpanType.LLM_CHUNK,
        name: 'error event span',
        output: null,
        attributes: {
          chunkType: 'error',
        },
      });

      // Try to record error on event span (should be no-op since event spans can't be updated)
      const testError = new MastraError({
        id: 'TEST_ERROR',
        domain: 'TOOL',
        category: 'USER',
        details: { test: true },
      });

      eventSpan.error({
        error: testError,
        endSpan: false, // This should be ignored for event spans
      });

      // Event span should still be properly formed
      expect(eventSpan.isEvent).toBe(true);
      expect(eventSpan.name).toBe('error event span');

      // Error info should not be set (since events can't be updated)
      expect(eventSpan.errorInfo).toBeUndefined();

      rootSpan.end();
    });
  });
});
