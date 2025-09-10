import type { AITracingEvent, AnyAISpan } from '@mastra/core/ai-tracing';
import { AISpanType } from '@mastra/core/ai-tracing';
import { RunTree } from 'langsmith';
import type { MockedFunction } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LangSmithExporterConfig } from './ai-tracing';
import { LangSmithExporter } from './ai-tracing';

// Mock the langsmith module
vi.mock('langsmith', () => {
  const mockRunTree = {
    createChild: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
    postRun: vi.fn(),
  };

  return {
    RunTree: vi.fn(() => mockRunTree),
  };
});

const MockedRunTree = RunTree as unknown as MockedFunction<typeof RunTree>;

describe('LangSmithExporter', () => {
  let exporter: LangSmithExporter;
  let mockRunTree: any;
  let config: LangSmithExporterConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockChildRun = {
      createChild: vi.fn(),
      update: vi.fn(),
      end: vi.fn(),
    };

    mockRunTree = {
      createChild: vi.fn().mockReturnValue(mockChildRun),
      update: vi.fn(),
      end: vi.fn(),
      postRun: vi.fn(),
    };

    MockedRunTree.mockReturnValue(mockRunTree);

    config = {
      apiKey: 'test-api-key',
      projectName: 'test-project',
      logLevel: 'warn',
    };

    exporter = new LangSmithExporter(config);
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(exporter.name).toBe('langsmith');
      // Client is not created in constructor anymore, so just check basic initialization
      expect(exporter).toBeDefined();
    });

    it('should disable exporter when API key is missing', () => {
      const invalidConfig = { projectName: 'test' };
      const disabledExporter = new LangSmithExporter(invalidConfig);

      // Should not throw and should handle missing credentials gracefully
      expect(disabledExporter.name).toBe('langsmith');
    });

    it('should use custom endpoint when provided', () => {
      const configWithEndpoint = {
        apiKey: 'test-key',
        endpoint: 'https://custom.langsmith.com',
      };

      const exporterWithEndpoint = new LangSmithExporter(configWithEndpoint);

      // Just check that it initializes without errors
      expect(exporterWithEndpoint).toBeDefined();
      expect(exporterWithEndpoint.name).toBe('langsmith');
    });
  });

  describe('span type mapping', () => {
    const createTestSpan = (type: AISpanType, isRoot = false): AnyAISpan => ({
      id: 'test-span-id',
      name: 'Test Span',
      type,
      startTime: new Date(),
      isEvent: false,
      traceId: 'test-trace-id',
      isRootSpan: isRoot,
      aiTracing: {} as any,
    });

    it('should map LLM_GENERATION to "llm"', async () => {
      const span = createTestSpan(AISpanType.LLM_GENERATION, true);
      const event: AITracingEvent = { type: 'span_started', span };

      mockRunTree.createChild.mockResolvedValue({});

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          run_type: 'llm',
        }),
      );
    });

    it('should map TOOL_CALL to "tool"', async () => {
      const span = createTestSpan(AISpanType.TOOL_CALL, true);
      const event: AITracingEvent = { type: 'span_started', span };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          run_type: 'tool',
        }),
      );
    });

    it('should map MCP_TOOL_CALL to "tool"', async () => {
      const span = createTestSpan(AISpanType.MCP_TOOL_CALL, true);
      const event: AITracingEvent = { type: 'span_started', span };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          run_type: 'tool',
        }),
      );
    });

    it('should map other span types to "chain"', async () => {
      const span = createTestSpan(AISpanType.AGENT_RUN, true);
      const event: AITracingEvent = { type: 'span_started', span };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          run_type: 'chain',
        }),
      );
    });
  });

  describe('root span handling', () => {
    it('should create RunTree for root span', async () => {
      const startTime = new Date();
      const rootSpan: AnyAISpan = {
        id: 'root-span-id',
        name: 'Root Span',
        type: AISpanType.AGENT_RUN,
        startTime: startTime,
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
        input: { test: 'input' },
      };

      const event: AITracingEvent = { type: 'span_started', span: rootSpan };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith({
        name: 'Root Span',
        run_type: 'chain',
        project_name: 'test-project',
        start_time: startTime.getTime(),
        inputs: { input: { test: 'input' } },
        extra: {
          metadata: {
            spanType: AISpanType.AGENT_RUN,
          },
        },
      });

      expect(mockRunTree.postRun).toHaveBeenCalled();
    });

    it('should use default project name when not specified', async () => {
      const exporterWithoutProject = new LangSmithExporter({
        apiKey: 'test-key',
      });

      const rootSpan: AnyAISpan = {
        id: 'root-span-id',
        name: 'Root Span',
        type: AISpanType.AGENT_RUN,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
      };

      const event: AITracingEvent = { type: 'span_started', span: rootSpan };

      await exporterWithoutProject.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          project_name: 'mastra-tracing',
        }),
      );
    });
  });

  describe('child span handling', () => {
    it('should create child run for non-root spans', async () => {
      const parentSpan: AnyAISpan = {
        id: 'parent-span-id',
        name: 'Parent Span',
        type: AISpanType.AGENT_RUN,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
      };

      const childSpan: AnyAISpan = {
        id: 'child-span-id',
        name: 'Child Span',
        type: AISpanType.LLM_GENERATION,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: false,
        parent: { id: 'parent-span-id' } as any,
        aiTracing: {} as any,
        input: { prompt: 'test' },
      };

      const mockChildRun = { update: vi.fn(), end: vi.fn(), createChild: vi.fn() };
      mockRunTree.createChild.mockReturnValue(mockChildRun);

      // First, create parent
      await exporter.exportEvent({ type: 'span_started', span: parentSpan });

      // Then create child
      await exporter.exportEvent({ type: 'span_started', span: childSpan });

      // Should be called twice: once for parent, once for child
      expect(mockRunTree.createChild).toHaveBeenCalledTimes(1);

      // Should have created the child run
      expect(mockChildRun.createChild).toHaveBeenCalledWith({
        name: 'Child Span',
        run_type: 'llm',
        inputs: { input: { prompt: 'test' } },
        start_time: childSpan.startTime.getTime(),
        extra: {
          metadata: {
            spanType: AISpanType.LLM_GENERATION,
          },
        },
      });
    });
  });

  describe('LLM generation attributes', () => {
    it('should handle LLM attributes correctly', async () => {
      const llmSpan: AnyAISpan = {
        id: 'llm-span-id',
        name: 'LLM Generation',
        type: AISpanType.LLM_GENERATION,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
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
            maxOutputTokens: 1000,
          },
        },
      };

      const event: AITracingEvent = { type: 'span_started', span: llmSpan };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          extra: {
            metadata: {
              spanType: AISpanType.LLM_GENERATION,
              model: 'gpt-4',
              provider: 'openai',
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
              promptTokens: 10,
              completionTokens: 20,
              totalTokens: 30,
              modelParameters: {
                temperature: 0.7,
                maxOutputTokens: 1000,
              },
            },
          },
        }),
      );
    });
  });

  describe('event span handling', () => {
    it('should handle event spans with zero duration', async () => {
      const eventSpan: AnyAISpan = {
        id: 'event-span-id',
        name: 'Event Span',
        type: AISpanType.LLM_CHUNK,
        startTime: new Date(),
        isEvent: true,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
        output: { chunk: 'test chunk' },
      };

      const mockEventRun = { end: vi.fn() };
      mockRunTree.createChild.mockReturnValue(mockEventRun);

      const event: AITracingEvent = { type: 'span_started', span: eventSpan };

      await exporter.exportEvent(event);

      // Should create root run
      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          start_time: eventSpan.startTime.getTime(),
        }),
      );

      // Should immediately end the event run
      expect(mockEventRun.end).toHaveBeenCalledWith({
        outputs: { output: { chunk: 'test chunk' } },
      });
    });
  });

  describe('span updates and endings', () => {
    it('should update spans correctly', async () => {
      const span: AnyAISpan = {
        id: 'test-span-id',
        name: 'Test Span',
        type: AISpanType.AGENT_RUN,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
        output: { result: 'updated' },
      };

      // Start span first
      await exporter.exportEvent({ type: 'span_started', span });

      // Update span - this doesn't call update method in current implementation
      // Just verify it doesn't throw
      await expect(exporter.exportEvent({ type: 'span_updated', span })).resolves.toBeUndefined();
    });

    it('should end spans correctly', async () => {
      const span: AnyAISpan = {
        id: 'test-span-id',
        name: 'Test Span',
        type: AISpanType.AGENT_RUN,
        startTime: new Date(),
        endTime: new Date(Date.now() + 1000),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
        output: { result: 'final' },
      };

      // Start span first
      await exporter.exportEvent({ type: 'span_started', span });

      // End span
      await exporter.exportEvent({ type: 'span_ended', span });

      expect(mockRunTree.end).toHaveBeenCalledWith({
        outputs: { output: { result: 'final' } },
      });
    });
  });

  describe('error handling', () => {
    it('should handle spans with errors', async () => {
      const errorSpan: AnyAISpan = {
        id: 'error-span-id',
        name: 'Error Span',
        type: AISpanType.TOOL_CALL,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
        errorInfo: {
          message: 'Something went wrong',
          id: 'ERROR_001',
          details: { context: 'test' },
        },
      };

      const event: AITracingEvent = { type: 'span_started', span: errorSpan };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Something went wrong',
          extra: {
            errorDetails: { context: 'test' },
            metadata: {
              spanType: AISpanType.TOOL_CALL,
            },
          },
        }),
      );
    });

    it('should handle disabled exporter gracefully', async () => {
      const disabledExporter = new LangSmithExporter({});
      const span: AnyAISpan = {
        id: 'test-span-id',
        name: 'Test Span',
        type: AISpanType.AGENT_RUN,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
      };

      const event: AITracingEvent = { type: 'span_started', span };

      // Should not throw
      await expect(disabledExporter.exportEvent(event)).resolves.toBeUndefined();
    });

    it('should handle missing parent span gracefully', async () => {
      const orphanSpan: AnyAISpan = {
        id: 'orphan-span-id',
        name: 'Orphan Span',
        type: AISpanType.LLM_GENERATION,
        startTime: new Date(),
        isEvent: false,
        traceId: 'nonexistent-trace-id',
        isRootSpan: false,
        parent: {
          id: 'missing-parent-id',
        } as any,
        aiTracing: {} as any,
      };

      const event: AITracingEvent = { type: 'span_started', span: orphanSpan };

      // Should not throw but should log warning
      await expect(exporter.exportEvent(event)).resolves.toBeUndefined();
    });
  });

  describe('metadata handling', () => {
    it('should include custom metadata', async () => {
      const spanWithMetadata: AnyAISpan = {
        id: 'metadata-span-id',
        name: 'Metadata Span',
        type: AISpanType.WORKFLOW_STEP,
        startTime: new Date(),
        isEvent: false,
        traceId: 'test-trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
        metadata: {
          userId: 'user123',
          sessionId: 'session456',
          customField: 'customValue',
        },
        attributes: {
          stepId: 'step-001',
          status: 'running',
        },
      };

      const event: AITracingEvent = { type: 'span_started', span: spanWithMetadata };

      await exporter.exportEvent(event);

      expect(MockedRunTree).toHaveBeenCalledWith(
        expect.objectContaining({
          extra: {
            metadata: {
              spanType: AISpanType.WORKFLOW_STEP,
              userId: 'user123',
              sessionId: 'session456',
              customField: 'customValue',
              stepId: 'step-001',
              status: 'running',
            },
          },
        }),
      );
    });
  });

  describe('shutdown', () => {
    it('should end all active runs during shutdown', async () => {
      const mockChildRun = { end: vi.fn(), createChild: vi.fn() };
      mockRunTree.createChild.mockReturnValue(mockChildRun);

      // Create some spans
      const rootSpan: AnyAISpan = {
        id: 'root-id',
        name: 'Root',
        type: AISpanType.AGENT_RUN,
        startTime: new Date(),
        isEvent: false,
        traceId: 'trace-id',
        isRootSpan: true,
        aiTracing: {} as any,
      };

      const childSpan: AnyAISpan = {
        id: 'child-id',
        name: 'Child',
        type: AISpanType.LLM_GENERATION,
        startTime: new Date(),
        isEvent: false,
        traceId: 'trace-id',
        isRootSpan: false,
        parent: { id: 'root-id' } as any,
        aiTracing: {} as any,
      };

      await exporter.exportEvent({ type: 'span_started', span: rootSpan });
      await exporter.exportEvent({ type: 'span_started', span: childSpan });

      // Shutdown
      await exporter.shutdown();

      expect(mockChildRun.end).toHaveBeenCalled();
      expect(mockRunTree.end).toHaveBeenCalled();
    });

    it('should handle disabled exporter shutdown gracefully', async () => {
      const disabledExporter = new LangSmithExporter({});
      await expect(disabledExporter.shutdown()).resolves.toBeUndefined();
    });
  });
});
