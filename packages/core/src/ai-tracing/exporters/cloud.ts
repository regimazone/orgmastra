import { ErrorCategory, ErrorDomain, MastraError } from '../../error';
import { ConsoleLogger, LogLevel } from '../../logger';
import type { IMastraLogger } from '../../logger';
import { fetchWithRetry } from '../../utils';
import { AITracingEventType } from '../types';
import type { AITracingEvent, AITracingExporter, AnyExportedAISpan } from '../types';

export interface CloudExporterConfig {
  maxBatchSize?: number; // Default: 1000 spans
  maxBatchWaitMs?: number; // Default: 5000ms
  maxRetries?: number; // Default: 3

  // Cloud-specific configuration
  accessToken?: string; // Cloud access token (from env or config)
  endpoint?: string; // Cloud AI tracing endpoint
  logger?: IMastraLogger; // Optional logger
}

interface MastraCloudBuffer {
  spans: MastraCloudSpanRecord[];
  firstEventTime?: Date;
  totalSize: number;
}

interface MastraCloudSpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  spanType: string;
  attributes: Record<string, any> | null;
  metadata: Record<string, any> | null;
  startedAt: Date;
  endedAt: Date | null;
  input: any;
  output: any;
  error: any;
  isEvent: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export class CloudExporter implements AITracingExporter {
  name = 'mastra-cloud-ai-tracing-exporter';

  private config: Required<CloudExporterConfig>;
  private buffer: MastraCloudBuffer;
  private flushTimer: NodeJS.Timeout | null = null;
  private logger: IMastraLogger;
  private isDisabled: boolean = false;

  constructor(config: CloudExporterConfig = {}) {
    this.logger = config.logger ?? new ConsoleLogger({ level: LogLevel.INFO });

    const accessToken = config.accessToken ?? process.env.MASTRA_CLOUD_ACCESS_TOKEN;
    if (!accessToken) {
      this.logger.warn(
        'CloudExporter disabled: MASTRA_CLOUD_ACCESS_TOKEN environment variable not set. ' +
          '🚀 Sign up for Mastra Cloud at https://cloud.mastra.ai to see your AI traces online and obtain your access token.',
      );
      this.isDisabled = true;
    }

    const endpoint =
      config.endpoint ?? process.env.MASTRA_CLOUD_AI_TRACES_ENDPOINT ?? 'https://api.mastra.ai/ai/spans/publish';

    this.config = {
      maxBatchSize: config.maxBatchSize ?? 1000,
      maxBatchWaitMs: config.maxBatchWaitMs ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      accessToken: accessToken || '', // Empty string if no token
      endpoint,
      logger: this.logger,
    };

    this.buffer = {
      spans: [],
      totalSize: 0,
    };
  }

  async exportEvent(event: AITracingEvent): Promise<void> {
    // Skip if disabled due to missing token
    if (this.isDisabled) {
      return;
    }

    // Cloud AI Observability only process SPAN_ENDED events
    if (event.type !== AITracingEventType.SPAN_ENDED) {
      return;
    }

    this.addToBuffer(event);

    if (this.shouldFlush()) {
      this.flush().catch(error => {
        this.logger.error('Batch flush failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } else if (this.buffer.totalSize === 1) {
      this.scheduleFlush();
    }
  }

  private addToBuffer(event: AITracingEvent): void {
    // Set first event time if buffer is empty
    if (this.buffer.totalSize === 0) {
      this.buffer.firstEventTime = new Date();
    }

    const spanRecord = this.formatSpan(event.exportedSpan);

    this.buffer.spans.push(spanRecord);
    this.buffer.totalSize++;
  }

  private formatSpan(span: AnyExportedAISpan): MastraCloudSpanRecord {
    const spanRecord: MastraCloudSpanRecord = {
      traceId: span.traceId,
      spanId: span.id,
      parentSpanId: span.parentSpanId ?? null,
      name: span.name,
      spanType: span.type,
      attributes: span.attributes ?? null,
      metadata: span.metadata ?? null,
      startedAt: span.startTime,
      endedAt: span.endTime ?? null,
      input: span.input ?? null,
      output: span.output ?? null,
      error: span.errorInfo,
      isEvent: span.isEvent,
      createdAt: new Date(),
      updatedAt: null,
    };

    return spanRecord;
  }

  private shouldFlush(): boolean {
    // Size-based flush
    if (this.buffer.totalSize >= this.config.maxBatchSize) {
      return true;
    }

    // Time-based flush
    if (this.buffer.firstEventTime && this.buffer.totalSize > 0) {
      const elapsed = Date.now() - this.buffer.firstEventTime.getTime();
      if (elapsed >= this.config.maxBatchWaitMs) {
        return true;
      }
    }

    return false;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flush().catch(error => {
        const mastraError = new MastraError(
          {
            id: `CLOUD_AI_TRACING_FAILED_TO_SCHEDULE_FLUSH`,
            domain: ErrorDomain.MASTRA_OBSERVABILITY,
            category: ErrorCategory.USER,
          },
          error,
        );
        this.logger.trackException(mastraError);
        this.logger.error('Scheduled flush failed', mastraError);
      });
    }, this.config.maxBatchWaitMs);
  }

  private async flush(): Promise<void> {
    // Clear timer since we're flushing
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.totalSize === 0) {
      return; // Nothing to flush
    }

    const startTime = Date.now();
    const spansCopy = [...this.buffer.spans];
    const flushReason = this.buffer.totalSize >= this.config.maxBatchSize ? 'size' : 'time';

    // Reset buffer immediately to prevent blocking new events
    this.resetBuffer();

    try {
      // Use fetchWithRetry for all retry logic
      await this.batchUpload(spansCopy);

      const elapsed = Date.now() - startTime;
      this.logger.debug('Batch flushed successfully', {
        batchSize: spansCopy.length,
        flushReason,
        durationMs: elapsed,
      });
    } catch (error) {
      const mastraError = new MastraError(
        {
          id: `CLOUD_AI_TRACING_FAILED_TO_BATCH_UPLOAD`,
          domain: ErrorDomain.MASTRA_OBSERVABILITY,
          category: ErrorCategory.USER,
          details: {
            droppedBatchSize: spansCopy.length,
          },
        },
        error,
      );
      this.logger.trackException(mastraError);
      this.logger.error('Batch upload failed after all retries, dropping batch', mastraError);
      // Don't re-throw - we want to continue processing new events
    }
  }

  /**
   * Uploads spans to cloud API using fetchWithRetry for all retry logic
   */
  private async batchUpload(spans: MastraCloudSpanRecord[]): Promise<void> {
    const url = `${this.config.endpoint}`;

    const headers = {
      Authorization: `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify({ spans }),
    };

    await fetchWithRetry(url, options, this.config.maxRetries);
  }

  private resetBuffer(): void {
    this.buffer.spans = [];
    this.buffer.firstEventTime = undefined;
    this.buffer.totalSize = 0;
  }

  async shutdown(): Promise<void> {
    // Skip if disabled
    if (this.isDisabled) {
      return;
    }

    // Clear any pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining events
    if (this.buffer.totalSize > 0) {
      this.logger.info('Flushing remaining events on shutdown', {
        remainingEvents: this.buffer.totalSize,
      });
      try {
        await this.flush();
      } catch (error) {
        const mastraError = new MastraError(
          {
            id: `CLOUD_AI_TRACING_FAILED_TO_FLUSH_REMAINING_EVENTS_DURING_SHUTDOWN`,
            domain: ErrorDomain.MASTRA_OBSERVABILITY,
            category: ErrorCategory.USER,
            details: {
              remainingEvents: this.buffer.totalSize,
            },
          },
          error,
        );

        this.logger.trackException(mastraError);
        this.logger.error('Failed to flush remaining events during shutdown', mastraError);
      }
    }

    this.logger.info('CloudExporter shutdown complete');
  }
}
