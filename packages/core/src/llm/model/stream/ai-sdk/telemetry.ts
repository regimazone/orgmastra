import type { Attributes, AttributeValue, Span, SpanContext, Tracer } from '@opentelemetry/api';
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

export function recordSpan<T>({
  name,
  tracer,
  attributes,
  fn,
  endWhenDone = true,
}: {
  name: string;
  tracer: Tracer;
  attributes: Attributes;
  fn: (span: Span) => Promise<T>;
  endWhenDone?: boolean;
}) {
  return tracer.startActiveSpan(name, { attributes }, async span => {
    try {
      const result = await fn(span);

      if (endWhenDone) {
        span.end();
      }

      return result;
    } catch (error) {
      try {
        recordErrorOnSpan(span, error);
      } finally {
        span.end();
      }

      throw error;
    }
  });
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

export function selectTelemetryAttributes({
  telemetry,
  attributes,
}: {
  telemetry?: TelemetrySettings;
  attributes: {
    [attributeKey: string]:
      | AttributeValue
      | { input: () => AttributeValue | undefined }
      | { output: () => AttributeValue | undefined }
      | undefined;
  };
}): Attributes {
  // when telemetry is disabled, return an empty object to avoid serialization overhead:
  if (telemetry?.isEnabled !== true) {
    return {};
  }

  return Object.entries(attributes).reduce((attributes, [key, value]) => {
    if (value == null) {
      return attributes;
    }

    // input value, check if it should be recorded:
    if (typeof value === 'object' && 'input' in value && typeof value.input === 'function') {
      // default to true:
      if (telemetry?.recordInputs === false) {
        return attributes;
      }

      const result = value.input();

      return result == null ? attributes : { ...attributes, [key]: result };
    }

    // output value, check if it should be recorded:
    if (typeof value === 'object' && 'output' in value && typeof value.output === 'function') {
      // default to true:
      if (telemetry?.recordOutputs === false) {
        return attributes;
      }

      const result = value.output();

      return result == null ? attributes : { ...attributes, [key]: result };
    }

    // value is an attribute value already:
    return { ...attributes, [key]: value };
  }, {});
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
    'resource.name': telemetry?.functionId,
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
