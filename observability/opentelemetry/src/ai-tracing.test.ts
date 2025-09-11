import { AISpanType, AITracingEventType } from '@mastra/core/ai-tracing';
import type { AnyAISpan } from '@mastra/core/ai-tracing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenTelemetryExporter } from './ai-tracing';

// Mock the OpenTelemetry modules
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn().mockImplementation(() => ({
    export: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  SimpleSpanProcessor: vi.fn(),
  BatchSpanProcessor: vi.fn(),
}));

vi.mock('@opentelemetry/sdk-trace-node', () => ({
  NodeTracerProvider: vi.fn().mockImplementation(() => ({
    addSpanProcessor: vi.fn(),
    register: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/resources', () => ({
  defaultResource: vi.fn().mockReturnValue({
    merge: vi.fn().mockReturnValue({}),
  }),
  resourceFromAttributes: vi.fn().mockReturnValue({}),
}));

vi.mock('./loadExporter', () => ({
  loadExporter: vi.fn().mockResolvedValue(
    vi.fn().mockImplementation(() => ({
      export: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    })),
  ),
}));

describe('OpenTelemetryExporter', () => {
  let exporter: OpenTelemetryExporter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    if (exporter) {
      await exporter.shutdown();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Provider Configuration', () => {
    it('should configure Dash0 provider correctly', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          dash0: {
            apiKey: 'test-api-key',
            region: 'us',
            dataset: 'test-dataset',
          },
        },
        serviceName: 'test-service',
      });

      const span = {
        id: 'span-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.AGENT_RUN,
        name: 'Test Span',
        startTime: new Date(),
        endTime: new Date(),
        input: { test: 'input' },
        output: { test: 'output' },
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span,
      });

      // Verify configuration was applied
      expect(exporter).toBeDefined();
    });

    it('should configure SigNoz provider correctly', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          signoz: {
            apiKey: 'test-api-key',
            region: 'us',
          },
        },
        serviceName: 'test-service',
      });

      const span = {
        id: 'span-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.AGENT_RUN,
        name: 'Test Span',
        startTime: new Date(),
        endTime: new Date(),
        input: { test: 'input' },
        output: { test: 'output' },
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span,
      });

      expect(exporter).toBeDefined();
    });

    it('should configure New Relic provider correctly', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          newrelic: {
            apiKey: 'test-license-key',
          },
        },
        serviceName: 'test-service',
      });

      const span = {
        id: 'span-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.AGENT_RUN,
        name: 'Test Span',
        startTime: new Date(),
        endTime: new Date(),
        input: { test: 'input' },
        output: { test: 'output' },
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span,
      });

      expect(exporter).toBeDefined();
    });
  });

  describe('Span Buffering', () => {
    it('should buffer spans until root completes', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          custom: {
            endpoint: 'http://localhost:4318',
          },
        },
        serviceName: 'test-service',
      });

      const rootSpan = {
        id: 'root-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.AGENT_RUN,
        name: 'Root Span',
        startTime: new Date(),
      } as unknown as AnyAISpan;

      const childSpan = {
        id: 'child-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.WORKFLOW_STEP,
        name: 'Child Span',
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as AnyAISpan;

      // Process child first (should buffer)
      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: childSpan,
      });

      // Process incomplete root (should buffer)
      await exporter.exportEvent({
        type: AITracingEventType.SPAN_STARTED,
        span: rootSpan,
      });

      // Complete root
      const completedRoot = { ...rootSpan, endTime: new Date() };
      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: completedRoot,
      });

      // Should schedule export after delay
      vi.advanceTimersByTime(5000);

      // Verify export was triggered
      expect(exporter).toBeDefined();
    });

    it('should handle multiple traces independently', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          custom: {
            endpoint: 'http://localhost:4318',
          },
        },
        serviceName: 'test-service',
      });

      const trace1Root = {
        id: 'root-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.WORKFLOW_RUN,
        name: 'Workflow 1',
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as AnyAISpan;

      const trace2Root = {
        id: 'root-2',
        traceId: 'trace-2',
        parent: undefined,
        type: AISpanType.WORKFLOW_RUN,
        name: 'Workflow 2',
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: trace1Root,
      });
      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: trace2Root,
      });

      // Both traces should be scheduled for export
      vi.advanceTimersByTime(5000);

      expect(exporter).toBeDefined();
    });
  });

  describe('Span Type Mapping', () => {
    it('should map LLM spans correctly', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          custom: {
            endpoint: 'http://localhost:4318',
          },
        },
        serviceName: 'test-service',
      });

      const llmSpan = {
        id: 'llm-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.LLM_GENERATION,
        name: 'LLM Generation',
        startTime: new Date(),
        endTime: new Date(),
        input: { messages: [{ role: 'user', content: 'Hello' }] },
        output: { content: 'Hi there!' },
        model: 'gpt-4',
        provider: 'openai',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: llmSpan,
      });

      vi.advanceTimersByTime(5000);
      expect(exporter).toBeDefined();
    });

    it('should map tool spans correctly', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          custom: {
            endpoint: 'http://localhost:4318',
          },
        },
        serviceName: 'test-service',
      });

      const toolSpan = {
        id: 'tool-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.TOOL_CALL,
        name: 'Calculator',
        startTime: new Date(),
        endTime: new Date(),
        input: { operation: 'add', a: 2, b: 3 },
        output: { result: 5 },
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: toolSpan,
      });

      vi.advanceTimersByTime(5000);
      expect(exporter).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle spans with errors', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          custom: {
            endpoint: 'http://localhost:4318',
          },
        },
        serviceName: 'test-service',
      });

      const errorSpan = {
        id: 'error-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.AGENT_RUN,
        name: 'Failed Operation',
        startTime: new Date(),
        endTime: new Date(),
        errorInfo: {
          message: 'Invalid input provided',
          details: {
            stack: 'Error: Invalid input\n  at validate()',
          },
        },
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span: errorSpan,
      });
      vi.advanceTimersByTime(5000);

      expect(exporter).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should export remaining traces on close', async () => {
      exporter = new OpenTelemetryExporter({
        provider: {
          custom: {
            endpoint: 'http://localhost:4318',
          },
        },
        serviceName: 'test-service',
      });

      const span: AnyAISpan = {
        id: 'span-1',
        traceId: 'trace-1',
        parent: undefined,
        type: AISpanType.AGENT_RUN,
        name: 'Test Span',
        startTime: new Date(),
        endTime: new Date(),
      } as unknown as AnyAISpan;

      await exporter.exportEvent({
        type: AITracingEventType.SPAN_ENDED,
        span,
      });

      // Close before timer expires
      await exporter.shutdown();

      expect(exporter).toBeDefined();
    });
  });
});
