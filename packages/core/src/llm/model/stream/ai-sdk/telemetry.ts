import type { Attributes, Span, SpanContext, Tracer } from '@opentelemetry/api';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { CallSettings, TelemetrySettings } from 'ai-v5';

export const noopTracer: Tracer = {
  startSpan(): Span {
    return noopSpan;
  },

  startActiveSpan<F extends (span: Span) => unknown>(
    name: unknown,
    arg1: unknown,
    arg2?: unknown,
    arg3?: F,
  ): ReturnType<any> {
    if (typeof arg1 === 'function') {
      return arg1(noopSpan);
    }
    if (typeof arg2 === 'function') {
      return arg2(noopSpan);
    }
    if (typeof arg3 === 'function') {
      return arg3(noopSpan);
    }
  },
};

const noopSpan: Span = {
  spanContext() {
    return noopSpanContext;
  },
  setAttribute() {
    return this;
  },
  setAttributes() {
    return this;
  },
  addEvent() {
    return this;
  },
  addLink() {
    return this;
  },
  addLinks() {
    return this;
  },
  setStatus() {
    return this;
  },
  updateName() {
    return this;
  },
  end() {
    return this;
  },
  isRecording() {
    return false;
  },
  recordException() {
    return this;
  },
};

const noopSpanContext: SpanContext = {
  traceId: '',
  spanId: '',
  traceFlags: 0,
};

export function getTracer({
  isEnabled = false,
  tracer,
}: {
  isEnabled?: boolean;
  tracer?: Tracer;
} = {}): Tracer {
  if (!isEnabled) {
    return noopTracer;
  }

  if (tracer) {
    return tracer;
  }

  return trace.getTracer('mastra');
}

export function recordErrorOnSpan(span: Span, error: unknown) {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

export function assembleOperationName({
  operationId,
  telemetry,
}: {
  operationId: string;
  telemetry?: TelemetrySettings;
}) {
  return {
    'mastra.operationId': operationId,
    'operation.name': `${operationId}${telemetry?.functionId != null ? ` ${telemetry.functionId}` : ''}`,
    ...(telemetry?.functionId ? { 'resource.name': telemetry?.functionId } : {}),
  };
}

export function getBaseTelemetryAttributes({
  model,
  settings,
  telemetry,
  headers,
}: {
  model: { modelId: string; provider: string };
  settings: Omit<CallSettings, 'abortSignal' | 'headers' | 'temperature'>;
  telemetry: TelemetrySettings | undefined;
  headers: Record<string, string | undefined> | undefined;
}): Attributes {
  return {
    'aisdk.model.provider': model.provider,
    'aisdk.model.id': model.modelId,

    // settings:
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      attributes[`stream.settings.${key}`] = value;
      return attributes;
    }, {} as Attributes),

    // add metadata as attributes:
    ...Object.entries(telemetry?.metadata ?? {}).reduce((attributes, [key, value]) => {
      attributes[`stream.telemetry.metadata.${key}`] = value;
      return attributes;
    }, {} as Attributes),

    // request headers
    ...Object.entries(headers ?? {}).reduce((attributes, [key, value]) => {
      if (value !== undefined) {
        attributes[`stream.request.headers.${key}`] = value;
      }
      return attributes;
    }, {} as Attributes),
  };
}
