/**
 * MastraAITracing - Abstract base class for AI Tracing implementations
 */

import { MastraBase } from '../../base';
import type { IMastraLogger } from '../../logger';
import { RegisteredLogger } from '../../logger/constants';
import { NoOpAISpan } from '../spans/no-op';
import type {
  TracingConfig,
  AISpan,
  AISpanType,
  AITracingExporter,
  AISpanProcessor,
  AITracingEvent,
  AnyAISpan,
  EndSpanOptions,
  UpdateSpanOptions,
  StartSpanOptions,
  CreateSpanOptions,
  AITracing,
  CustomSamplerOptions,
  AnyExportedAISpan,
} from '../types';
import { SamplingStrategyType, AITracingEventType } from '../types';

// ============================================================================
// Abstract Base Class
// ============================================================================

/**
 * Abstract base class for all AI Tracing implementations in Mastra.
 */
export abstract class BaseAITracing extends MastraBase implements AITracing {
  protected config: Required<TracingConfig>;

  constructor(config: TracingConfig) {
    super({ component: RegisteredLogger.AI_TRACING, name: config.serviceName });

    // Apply defaults for optional fields
    this.config = {
      serviceName: config.serviceName,
      name: config.name,
      sampling: config.sampling ?? { type: SamplingStrategyType.ALWAYS },
      exporters: config.exporters ?? [],
      processors: config.processors ?? [],
      includeInternalSpans: config.includeInternalSpans ?? false,
    };
  }

  /**
   * Override setLogger to add AI tracing specific initialization log
   */
  __setLogger(logger: IMastraLogger) {
    super.__setLogger(logger);
    // Log AI tracing initialization details after logger is properly set
    this.logger.debug(
      `[AI Tracing] Initialized [service=${this.config.serviceName}] [instance=${this.config.name}] [sampling=${this.config.sampling.type}]`,
    );
  }

  // ============================================================================
  // Protected getters for clean config access
  // ============================================================================

  protected get exporters(): AITracingExporter[] {
    return this.config.exporters || [];
  }

  protected get processors(): AISpanProcessor[] {
    return this.config.processors || [];
  }

  // ============================================================================
  // Public API - Single type-safe span creation method
  // ============================================================================

  /**
   * Start a new span of a specific AISpanType
   */
  startSpan<TType extends AISpanType>(options: StartSpanOptions<TType>): AISpan<TType> {
    const { customSamplerOptions, ...createSpanOptions } = options;

    if (!this.shouldSample(customSamplerOptions)) {
      return new NoOpAISpan<TType>(createSpanOptions, this);
    }

    const span = this.createSpan<TType>(createSpanOptions);

    if (span.isEvent) {
      this.emitSpanEnded(span);
    } else {
      // Automatically wire up tracing lifecycle
      this.wireSpanLifecycle(span);

      // Emit span started event
      this.emitSpanStarted(span);
    }

    return span;
  }

  // ============================================================================
  // Abstract Methods - Must be implemented by concrete classes
  // ============================================================================

  /**
   * Create a new span (called after sampling)
   *
   * Implementations should:
   * 1. Create a plain span with the provided attributes
   * 2. Return the span - base class handles all tracing lifecycle automatically
   *
   * The base class will automatically:
   * - Set trace relationships
   * - Wire span lifecycle callbacks
   * - Emit span_started event
   */
  protected abstract createSpan<TType extends AISpanType>(options: CreateSpanOptions<TType>): AISpan<TType>;

  // ============================================================================
  // Configuration Management
  // ============================================================================

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<TracingConfig>> {
    return { ...this.config };
  }

  // ============================================================================
  // Plugin Access
  // ============================================================================

  /**
   * Get all exporters
   */
  getExporters(): readonly AITracingExporter[] {
    return [...this.exporters];
  }

  /**
   * Get all processors
   */
  getProcessors(): readonly AISpanProcessor[] {
    return [...this.processors];
  }

  /**
   * Get the logger instance (for exporters and other components)
   */
  getLogger() {
    return this.logger;
  }

  // ============================================================================
  // Span Lifecycle Management
  // ============================================================================

  /**
   * Automatically wires up AI tracing lifecycle events for any span
   * This ensures all spans emit events regardless of implementation
   */
  private wireSpanLifecycle<TType extends AISpanType>(span: AISpan<TType>): void {
    // bypass wire up if internal span and not includeInternalSpans
    if (!this.config.includeInternalSpans && span.isInternal) {
      return
    }
    
    // Store original methods
    const originalEnd = span.end.bind(span);
    const originalUpdate = span.update.bind(span);

    // Wrap methods to automatically emit tracing events
    span.end = (options?: EndSpanOptions<TType>) => {
      if (span.isEvent) {
        this.logger.warn(`End event is not available on event spans`);
        return;
      }
      originalEnd(options);
      this.emitSpanEnded(span);
    };

    span.update = (options: UpdateSpanOptions<TType>) => {
      if (span.isEvent) {
        this.logger.warn(`Update() is not available on event spans`);
        return;
      }
      originalUpdate(options);
      this.emitSpanUpdated(span);
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Check if an AI trace should be sampled
   */
  protected shouldSample(options?: CustomSamplerOptions): boolean {
    // Check built-in sampling strategy
    const { sampling } = this.config;

    switch (sampling.type) {
      case SamplingStrategyType.ALWAYS:
        return true;
      case SamplingStrategyType.NEVER:
        return false;
      case SamplingStrategyType.RATIO:
        if (sampling.probability === undefined || sampling.probability < 0 || sampling.probability > 1) {
          this.logger.warn(
            `Invalid sampling probability: ${sampling.probability}. Expected value between 0 and 1. Defaulting to no sampling.`,
          );
          return false;
        }
        return Math.random() < sampling.probability;
      case SamplingStrategyType.CUSTOM:
        return sampling.sampler(options);
      default:
        throw new Error(`Sampling strategy type not implemented: ${(sampling as any).type}`);
    }
  }

  /**
   * Process a span through all processors
   */
  private processSpan(span: AnyAISpan): AnyAISpan | null {
    let processedSpan: AnyAISpan | null = span;

    for (const processor of this.processors) {
      if (!processedSpan) {
        break;
      }

      try {
        processedSpan = processor.process(processedSpan);
      } catch (error) {
        this.logger.error(`[AI Tracing] Processor error [name=${processor.name}]`, error);
        // Continue with other processors
      }
    }

    return processedSpan;
  }

  // ============================================================================
  // Event-driven Export Methods
  // ============================================================================

  getSpanForExport(span: AnyAISpan): AnyExportedAISpan | undefined {
    if (!span.isValid) return undefined;
    if (span.isInternal && !this.config.includeInternalSpans) return undefined;
    
    const processedSpan = this.processSpan(span);
    if (!processedSpan) return undefined;

    return processedSpan?.exportSpan(this.config.includeInternalSpans);
  }

  /**
   * Emit a span started event
   */
  protected emitSpanStarted(span: AnyAISpan): void {
    const exportedSpan = this.getSpanForExport(span);
    if (exportedSpan) {
      this.exportEvent({ type: AITracingEventType.SPAN_STARTED, exportedSpan }).catch(error => {
        this.logger.error('[AI Tracing] Failed to export span_started event', error);
      });
    }
  }

  /**
   * Emit a span ended event (called automatically when spans end)
   */
  protected emitSpanEnded(span: AnyAISpan): void {
    const exportedSpan = this.getSpanForExport(span);
    if (exportedSpan) {
      this.exportEvent({ type: AITracingEventType.SPAN_ENDED, exportedSpan }).catch(error => {
        this.logger.error('[AI Tracing] Failed to export span_ended event', error);
      });
    }
  }

  /**
   * Emit a span updated event
   */
  protected emitSpanUpdated(span: AnyAISpan): void {
    const exportedSpan = this.getSpanForExport(span);
    if (exportedSpan) {
      this.exportEvent({ type: AITracingEventType.SPAN_UPDATED, exportedSpan }).catch(error => {
        this.logger.error('[AI Tracing] Failed to export span_updated event', error);
      });
    }
  }

  /**
   * Export tracing event through all exporters (realtime mode)
   */
  protected async exportEvent(event: AITracingEvent): Promise<void> {
    const exportPromises = this.exporters.map(async exporter => {
      try {
        if (exporter.exportEvent) {
          await exporter.exportEvent(event);
          this.logger.debug(`[AI Tracing] Event exported [exporter=${exporter.name}] [type=${event.type}]`);
        }
      } catch (error) {
        this.logger.error(`[AI Tracing] Export error [exporter=${exporter.name}]`, error);
        // Don't rethrow - continue with other exporters
      }
    });

    await Promise.allSettled(exportPromises);
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Initialize AI tracing (called by Mastra during component registration)
   */
  init(): void {
    this.logger.debug(`[AI Tracing] Initialization started [name=${this.name}]`);

    // Any initialization logic for the AI tracing system
    // This could include setting up queues, starting background processes, etc.

    this.logger.info(`[AI Tracing] Initialized successfully [name=${this.name}]`);
  }

  /**
   * Shutdown AI tracing and clean up resources
   */
  async shutdown(): Promise<void> {
    this.logger.debug(`[AI Tracing] Shutdown started [name=${this.name}]`);

    // Shutdown all components
    const shutdownPromises = [...this.exporters.map(e => e.shutdown()), ...this.processors.map(p => p.shutdown())];

    await Promise.allSettled(shutdownPromises);

    this.logger.info(`[AI Tracing] Shutdown completed [name=${this.name}]`);
  }
}
