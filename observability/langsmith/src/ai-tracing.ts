/**
 * LangSmith Exporter for Mastra AI Tracing
 *
 * This exporter sends tracing data to LangSmith for AI observability.
 * Root spans create RunTree instances in LangSmith projects.
 * Child spans use the RunTree createChild() method for proper hierarchical relationships.
 */

import type { AITracingExporter, AITracingEvent, AnyAISpan, LLMGenerationAttributes } from '@mastra/core/ai-tracing';
import { AISpanType, omitKeys } from '@mastra/core/ai-tracing';
import { ConsoleLogger } from '@mastra/core/logger';
import { RunTree } from 'langsmith';

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

type TraceData = {
  rootRun: RunTree; // Root RunTree for the trace
  runs: Map<string, RunTree>; // Maps span.id to RunTree instances
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

  constructor(config: LangSmithExporterConfig) {
    this.logger = new ConsoleLogger({ level: config.logLevel ?? 'warn' });

    if (!config.apiKey) {
      this.logger.error('LangSmithExporter: Missing required credentials, exporter will be disabled', {
        hasApiKey: !!config.apiKey,
      });
      this.config = null as any;
      return;
    }

    this.config = config;
  }

  async exportEvent(event: AITracingEvent): Promise<void> {
    if (!this.config) {
      // Exporter is disabled due to missing credentials
      return;
    }

    if (event.span.isEvent) {
      await this.handleEventSpan(event.span);
      return;
    }

    switch (event.type) {
      case 'span_started':
        await this.handleSpanStarted(event.span);
        break;
      case 'span_updated':
        await this.handleSpanUpdateOrEnd(event.span, false);
        break;
      case 'span_ended':
        await this.handleSpanUpdateOrEnd(event.span, true);
        break;
    }
  }

  private async handleSpanStarted(span: AnyAISpan): Promise<void> {
    if (span.isRootSpan) {
      await this.initTrace(span);
    }

    const method = 'handleSpanStarted';
    const traceData = this.getTraceData({ span, method });
    if (!traceData) {
      return;
    }

    const parentRun = this.getParentRun({ traceData, span, method });
    if (!parentRun) {
      return;
    }

    const payload = this.buildRunPayload(span, true);

    let childRun: RunTree;
    if (parentRun === traceData.rootRun) {
      // Creating child of root run
      childRun = traceData.rootRun.createChild({
        name: span.name,
        run_type: mapRunType(span.type),
        ...payload,
      });
    } else {
      // Creating child of another run
      childRun = parentRun.createChild({
        name: span.name,
        run_type: mapRunType(span.type),
        ...payload,
      });
    }

    traceData.runs.set(span.id, childRun);
  }

  private async handleSpanUpdateOrEnd(span: AnyAISpan, isEnd: boolean): Promise<void> {
    const method = isEnd ? 'handleSpanEnd' : 'handleSpanUpdate';

    const traceData = this.getTraceData({ span, method });
    if (!traceData) {
      return;
    }

    let targetRun: RunTree;
    if (span.isRootSpan) {
      targetRun = traceData.rootRun;
    } else {
      const childRun = traceData.runs.get(span.id);
      if (!childRun) {
        this.logger.warn('LangSmith exporter: No RunTree found for span update/end', {
          traceId: span.traceId,
          spanId: span.id,
          spanName: span.name,
          spanType: span.type,
          isRootSpan: span.isRootSpan,
          parentSpanId: span.parent?.id,
          method,
        });
        return;
      }
      targetRun = childRun;
    }

    // Update the run with new data
    const updatePayload = this.buildRunPayload(span, false);
    if (Object.keys(updatePayload).length > 0) {
      // RunTree doesn't have update method, we'll handle updates in end()
      // For now, we'll store the update data and apply it when ending
    }

    if (isEnd) {
      // End the run
      if (span.endTime) {
        await targetRun.end({
          outputs: span.output ? { output: span.output } : undefined,
        });
      } else {
        await targetRun.end();
      }

      // Clean up trace data when root span ends
      if (span.isRootSpan) {
        this.traceMap.delete(span.traceId);
      }
    }
  }

  private async handleEventSpan(span: AnyAISpan): Promise<void> {
    if (span.isRootSpan) {
      this.logger.debug('LangSmith exporter: Creating root run for event', {
        traceId: span.traceId,
        spanId: span.id,
        spanName: span.name,
        method: 'handleEventSpan',
      });
      await this.initTrace(span);
    }

    const method = 'handleEventSpan';
    const traceData = this.getTraceData({ span, method });
    if (!traceData) {
      return;
    }

    const parentRun = this.getParentRun({ traceData, span, method });
    if (!parentRun) {
      return;
    }

    const payload = this.buildRunPayload(span, true);

    // Create zero-duration run for event
    let eventRun: RunTree;
    if (parentRun === traceData.rootRun) {
      eventRun = traceData.rootRun.createChild({
        name: span.name,
        run_type: mapRunType(span.type),
        start_time: span.startTime.getTime(),
        end_time: span.startTime.getTime(), // Same start and end time for events
        ...payload,
      });
    } else {
      eventRun = parentRun.createChild({
        name: span.name,
        run_type: mapRunType(span.type),
        start_time: span.startTime.getTime(),
        end_time: span.startTime.getTime(), // Same start and end time for events
        ...payload,
      });
    }

    // Immediately end the event run
    await eventRun.end({
      outputs: span.output ? { output: span.output } : undefined,
    });

    traceData.runs.set(span.id, eventRun);

    // Clean up root trace if this was a root event
    if (span.isRootSpan) {
      this.traceMap.delete(span.traceId);
    }
  }

  private async initTrace(span: AnyAISpan): Promise<void> {
    const payload = this.buildRunPayload(span, true);

    const rootRun = new RunTree({
      name: span.name,
      run_type: mapRunType(span.type),
      project_name: this.config.projectName ?? 'mastra-tracing',
      start_time: span.startTime.getTime(),
      ...payload,
    });

    // Post the root run to LangSmith
    await rootRun.postRun();

    this.traceMap.set(span.traceId, {
      rootRun,
      runs: new Map(),
    });
  }

  private getTraceData(options: { span: AnyAISpan; method: string }): TraceData | undefined {
    const { span, method } = options;
    if (this.traceMap.has(span.traceId)) {
      return this.traceMap.get(span.traceId);
    }

    this.logger.warn('LangSmith exporter: No trace data found for span', {
      traceId: span.traceId,
      spanId: span.id,
      spanName: span.name,
      spanType: span.type,
      isRootSpan: span.isRootSpan,
      parentSpanId: span.parent?.id,
      method,
    });
  }

  private getParentRun(options: { traceData: TraceData; span: AnyAISpan; method: string }): RunTree | undefined {
    const { traceData, span, method } = options;

    const parentId = span.parent?.id;
    if (!parentId) {
      return traceData.rootRun;
    }

    if (traceData.runs.has(parentId)) {
      return traceData.runs.get(parentId);
    }

    this.logger.warn('LangSmith exporter: No parent run found for span', {
      traceId: span.traceId,
      spanId: span.id,
      spanName: span.name,
      spanType: span.type,
      isRootSpan: span.isRootSpan,
      parentSpanId: span.parent?.id,
      method,
    });
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

  async shutdown(): Promise<void> {
    if (!this.config) {
      return;
    }

    // End all active runs
    for (const [_traceId, traceData] of this.traceMap) {
      // End child runs first
      for (const [_spanId, run] of traceData.runs) {
        try {
          await run.end();
        } catch (error) {
          this.logger.warn('Error ending run during shutdown', { error });
        }
      }

      // End root run
      try {
        await traceData.rootRun.end();
      } catch (error) {
        this.logger.warn('Error ending root run during shutdown', { error });
      }
    }

    this.traceMap.clear();
  }
}
