/**
 * LangSmith Exporter for Mastra AI Tracing
 *
 * This exporter buffers spans and sends complete traces to LangSmith for AI observability.
 * Only complete traces are sent to avoid timing issues with parent-child relationships.
 */

import type { AITracingExporter, AITracingEvent, AnyAISpan, LLMGenerationAttributes } from '@mastra/core/ai-tracing';
import { AISpanType, omitKeys } from '@mastra/core/ai-tracing';
import { ConsoleLogger } from '@mastra/core/logger';
import { RunTree, Client } from 'langsmith';

export interface LangSmithExporterConfig {
  /** LangSmith API key */
  apiKey?: string;
  /** LangSmith project name (default: 'mastra-tracing') */
  projectName?: string;
  /** Custom endpoint URL */
  endpoint?: string;
  /** Logger level for diagnostic messages (default: 'warn') */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Additional options to pass to the LangSmith client */
  options?: any;
}

type SpanData = {
  span: AnyAISpan;
  isComplete: boolean;
};

type TraceData = {
  spans: Map<string, SpanData>; // Maps span.id to span data
  rootSpanId: string;
  isRootComplete: boolean;
};

// Mapping from Mastra AISpanType to LangSmith run_type
const SPAN_TYPE_MAPPING: Partial<Record<AISpanType, string>> = {
  [AISpanType.LLM_GENERATION]: 'llm',
  [AISpanType.LLM_CHUNK]: 'llm',
  [AISpanType.TOOL_CALL]: 'tool',
  [AISpanType.MCP_TOOL_CALL]: 'tool',
  // Everything else defaults to 'chain'
};

function mapRunType(spanType: AISpanType): string {
  return SPAN_TYPE_MAPPING[spanType] ?? 'chain';
}

export class LangSmithExporter implements AITracingExporter {
  name = 'langsmith';
  private traceMap = new Map<string, TraceData>();
  private logger: ConsoleLogger;
  private config: LangSmithExporterConfig;
  private client?: Client;

  constructor(config: LangSmithExporterConfig) {
    this.logger = new ConsoleLogger({ level: config.logLevel ?? 'warn' });

    if (!config.apiKey) {
      console.error('❌ LangSmithExporter: Missing API key! Exporter disabled.');
      console.error('   Set LANGSMITH_API_KEY environment variable');
      this.config = null as any;
      return;
    } else {
      console.log('🔑 LangSmithExporter: API key found:', config.apiKey.slice(0, 8) + '...');
    }

    this.config = config;

    // Set required environment variables for LangSmith SDK
    // Set both LANGCHAIN_ and LANGSMITH_ prefixes for maximum compatibility
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = config.apiKey;
    process.env.LANGSMITH_API_KEY = config.apiKey; // Also set LANGSMITH_ variant
    if (config.endpoint) {
      process.env.LANGCHAIN_ENDPOINT = config.endpoint;
      process.env.LANGSMITH_ENDPOINT = config.endpoint;
    }

    // Enable debug logging if logLevel is debug
    const clientOptions: any = {
      // Let the client pick up API key from environment variables we just set
      // This might work better than passing it directly
      ...(config.endpoint && { apiUrl: config.endpoint }),
      ...config.options,
    };

    // Enable SDK debug logging for troubleshooting
    if (config.logLevel === 'debug') {
      console.log('🐛 Enabling LangSmith SDK debug mode');
      clientOptions.timeout = 30000; // 30 second timeout for debugging

      // Some versions of the SDK support these debug options:
      clientOptions.debug = true;
      clientOptions.verbose = true;

      // Set additional debug environment variables
      process.env.LANGCHAIN_DEBUG = 'true';

      console.log('🐛 LangSmith debug environment variables set');

      // Debug API key format
      console.log('🐛 API key format check:', {
        length: config.apiKey?.length,
        startsWithLsv2: config.apiKey?.startsWith('lsv2_'),
        hasSecondUnderscore: config.apiKey?.indexOf('_', 5) > 5,
      });
    }

    this.client = new Client(clientOptions);

    console.log('✅ LangSmithExporter initialized');

    // Test connection on initialization
    this.testConnection().catch(error => {
      console.error('⚠️ LangSmith connection test failed:', error.message);
    });
  }

  async exportEvent(event: AITracingEvent): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      if (event.span.isEvent) {
        // For event spans, send immediately as they're complete by definition
        await this.sendEventSpan(event.span);
        return;
      }

      // Buffer the span data
      this.bufferSpan(event.span, event.type === 'span_ended');

      // If this span ended and it's the root span, send the entire trace
      if (event.type === 'span_ended' && event.span.isRootSpan) {
        await this.sendCompleteTrace(event.span.traceId);
      }
    } catch (error) {
      this.logger.error('LangSmithExporter: Error processing event', {
        error: error instanceof Error ? error.message : String(error),
        eventType: event.type,
        spanId: event.span.id,
        spanName: event.span.name,
      });
      throw error;
    }
  }

  private bufferSpan(span: AnyAISpan, isComplete: boolean): void {
    // Initialize trace data if this is the root span
    if (span.isRootSpan && !this.traceMap.has(span.traceId)) {
      this.traceMap.set(span.traceId, {
        spans: new Map(),
        rootSpanId: span.id,
        isRootComplete: false,
      });
    }

    const traceData = this.traceMap.get(span.traceId);
    if (!traceData) {
      this.logger.warn('LangSmithExporter: No trace data found for span', {
        traceId: span.traceId,
        spanId: span.id,
        spanName: span.name,
      });
      return;
    }

    // Update span data
    traceData.spans.set(span.id, {
      span,
      isComplete,
    });

    // Mark root as complete if this is the root span ending
    if (span.isRootSpan && isComplete) {
      traceData.isRootComplete = true;
    }
  }

  private async sendCompleteTrace(traceId: string): Promise<void> {
    const traceData = this.traceMap.get(traceId);
    if (!traceData) {
      this.logger.warn('LangSmithExporter: No trace data found', { traceId });
      return;
    }

    try {
      // Create RunTree hierarchy for complete trace
      const runMap = new Map<string, RunTree>();

      // First, create the root run
      const rootSpanData = traceData.spans.get(traceData.rootSpanId);
      if (!rootSpanData) {
        this.logger.error('LangSmithExporter: Root span not found', { traceId });
        return;
      }

      const rootSpan = rootSpanData.span;
      const rootPayload = this.buildRunPayload(rootSpan, true);

      const rootRun = new RunTree({
        name: rootSpan.name,
        run_type: mapRunType(rootSpan.type),
        project_name: this.config.projectName ?? 'mastra-tracing',
        start_time: rootSpan.startTime.getTime(),
        end_time: rootSpan.endTime?.getTime(),
        client: this.client,
        ...rootPayload,
      });

      runMap.set(rootSpan.id, rootRun);

      // Create child runs in proper order (breadth-first to ensure parents exist)
      const processedSpans = new Set([rootSpan.id]);
      const spanQueue = Array.from(traceData.spans.values())
        .filter(spanData => spanData.span.id !== rootSpan.id)
        .map(spanData => spanData.span);

      while (spanQueue.length > 0) {
        const initialLength = spanQueue.length;

        for (let i = spanQueue.length - 1; i >= 0; i--) {
          const span = spanQueue[i];
          if (!span) continue;
          const parentId = span.parent?.id;

          // If no parent or parent already processed, create this run
          if (!parentId || processedSpans.has(parentId)) {
            const parentRun = parentId ? runMap.get(parentId) : rootRun;
            if (!parentRun) {
              this.logger.warn('LangSmithExporter: Parent run not found', {
                spanId: span.id,
                parentId,
              });
              spanQueue.splice(i, 1);
              continue;
            }

            const payload = this.buildRunPayload(span, true);
            const childRun = parentRun.createChild({
              name: span.name,
              run_type: mapRunType(span.type),
              start_time: span.startTime.getTime(),
              end_time: span.endTime?.getTime(),
              ...payload,
            });

            runMap.set(span.id, childRun);
            processedSpans.add(span.id);
            spanQueue.splice(i, 1);
          }
        }

        // Prevent infinite loop if no progress made
        if (spanQueue.length === initialLength) {
          this.logger.warn('LangSmithExporter: Unable to process remaining spans', {
            remaining: spanQueue.map(s => ({ id: s.id, parentId: s.parent?.id })),
          });
          break;
        }
      }

      // Post the complete trace to LangSmith
      console.log('🚀 Posting trace to LangSmith...', {
        traceId,
        projectName: this.config.projectName ?? 'mastra-tracing',
        rootSpanName: rootSpan.name,
        spanCount: traceData.spans.size,
      });

      if (this.config.logLevel === 'debug') {
        console.log('🐛 Root run details before posting:', {
          id: rootRun.id,
          name: rootRun.name,
          projectName: rootRun.project_name,
          runType: rootRun.run_type,
          startTime: rootRun.start_time,
          endTime: rootRun.end_time,
          hasClient: !!rootRun.client,
          childCount: runMap.size - 1, // -1 for root
        });
      }

      await rootRun.postRun();

      if (this.config.logLevel === 'debug') {
        console.log('🐛 Root run after posting:', {
          id: rootRun.id,
        });
      }

      console.log('✅ Posted complete trace to LangSmith:', traceId);
    } catch (error) {
      console.error('❌ Failed to send trace:', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      // Clean up trace data
      this.traceMap.delete(traceId);
    }
  }

  private async sendEventSpan(span: AnyAISpan): Promise<void> {
    try {
      const payload = this.buildRunPayload(span, true);

      // For event spans, create a standalone run
      const eventRun = new RunTree({
        name: span.name,
        run_type: mapRunType(span.type),
        project_name: this.config.projectName ?? 'mastra-tracing',
        start_time: span.startTime.getTime(),
        end_time: span.startTime.getTime(), // Same start and end time for events
        client: this.client,
        ...payload,
      });

      console.log('🚀 Posting event span to LangSmith...', {
        spanId: span.id,
        spanName: span.name,
        projectName: this.config.projectName ?? 'mastra-tracing',
      });

      await eventRun.postRun();
      console.log('✅ Posted event span to LangSmith:', span.id);
    } catch (error) {
      console.error('❌ Failed to send event span:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private buildRunPayload(span: AnyAISpan, isCreate: boolean): Record<string, any> {
    const payload: Record<string, any> = {};

    // Core span data
    if (isCreate && span.input !== undefined) {
      payload.inputs = { input: span.input };
    }

    if (span.output !== undefined) {
      payload.outputs = { output: span.output };
    }

    // Initialize metadata
    const metadata: Record<string, any> = {
      spanType: span.type,
      ...span.metadata,
    };

    const attributes = (span.attributes ?? {}) as Record<string, any>;

    // Handle LLM-specific attributes
    if (span.type === AISpanType.LLM_GENERATION) {
      const llmAttr = attributes as LLMGenerationAttributes;

      if (llmAttr.model !== undefined) {
        metadata.model = llmAttr.model;
      }

      if (llmAttr.provider !== undefined) {
        metadata.provider = llmAttr.provider;
      }

      if (llmAttr.usage !== undefined) {
        metadata.usage = llmAttr.usage;
        // Also add individual token counts for better visibility
        if (llmAttr.usage.promptTokens !== undefined) {
          metadata.promptTokens = llmAttr.usage.promptTokens;
        }
        if (llmAttr.usage.completionTokens !== undefined) {
          metadata.completionTokens = llmAttr.usage.completionTokens;
        }
        if (llmAttr.usage.totalTokens !== undefined) {
          metadata.totalTokens = llmAttr.usage.totalTokens;
        }
      }

      if (llmAttr.parameters !== undefined) {
        metadata.modelParameters = llmAttr.parameters;
      }

      // Include other LLM attributes
      const otherAttributes = omitKeys(attributes, ['model', 'provider', 'usage', 'parameters']);
      Object.assign(metadata, otherAttributes);
    } else {
      // For non-LLM spans, include all attributes in metadata
      Object.assign(metadata, attributes);
    }

    // Add metadata to payload
    if (Object.keys(metadata).length > 0) {
      payload.extra = { metadata };
    }

    // Handle errors
    if (span.errorInfo) {
      payload.error = span.errorInfo.message;
      if (span.errorInfo.details) {
        payload.extra = payload.extra || {};
        payload.extra.errorDetails = span.errorInfo.details;
      }
    }

    // Add timestamps if this is a create operation
    if (isCreate) {
      payload.start_time = span.startTime.getTime();
      if (span.endTime) {
        payload.end_time = span.endTime.getTime();
      }
    }

    return payload;
  }

  private async testConnection(): Promise<void> {
    try {
      console.log('🔗 LangSmith client configured:', {
        apiKeyPrefix: this.config.apiKey?.slice(0, 8) + '...',
        endpoint: this.config.endpoint || 'default',
        projectName: this.config.projectName ?? 'mastra-tracing',
      });

      // Test API key permissions by checking if we can list projects
      if (this.config.logLevel === 'debug') {
        try {
          const projects = await this.client!.listProjects();
          let projectCount = 0;
          for await (const project of projects) {
            projectCount++;
            break; // Just check if we can get at least one
          }
          console.log('🔑 API key can list projects:', projectCount > 0 ? 'YES' : 'NO (empty list)');

          // Try to check if project exists
          try {
            const project = await this.client!.readProject({
              projectName: this.config.projectName ?? 'mastra-tracing',
            });
            console.log('📁 Target project exists:', project.name, 'ID:', project.id);
          } catch (projectError: any) {
            if (projectError.message?.includes('404') || projectError.message?.includes('not found')) {
              console.log('📁 Target project does not exist, will be created when first trace is sent');
            } else {
              console.log('📁 Project check error:', projectError.message);
            }
          }
        } catch (listError: any) {
          console.log('🚫 API key permissions test failed:', listError.message);
          console.log('   This might indicate insufficient permissions to read/write traces');
        }
      }

      console.log('✅ LangSmith exporter ready (connection will be tested on first trace)');
    } catch (error: any) {
      console.error('🚫 LangSmith connection test failed:', {
        error: error.message || String(error),
        apiKeyPrefix: this.config.apiKey?.slice(0, 8) + '...',
        endpoint: this.config.endpoint || 'default',
        projectName: this.config.projectName ?? 'mastra-tracing',
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.config) {
      return;
    }

    // Send any remaining incomplete traces
    for (const [traceId, traceData] of this.traceMap) {
      if (traceData.isRootComplete) {
        try {
          await this.sendCompleteTrace(traceId);
        } catch (error) {
          this.logger.warn('Error sending trace during shutdown', { error, traceId });
        }
      }
    }

    this.traceMap.clear();
  }
}
