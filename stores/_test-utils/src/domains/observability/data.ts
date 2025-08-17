import { randomUUID } from 'crypto';
import type { AISpanDatabaseRecord } from '@mastra/core/ai-tracing';

export const createSampleAiSpan = (
  name: string,
  spanType: number = 0, // AGENT_RUN = 0
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
  startTime?: number,
): Omit<AISpanDatabaseRecord, 'id'> => ({
  traceId: `trace-${randomUUID()}`,
  spanId: `span-${randomUUID()}`,
  parentSpanId: null,
  name,
  scope: scope || null,
  spanType,
  attributes: attributes || null,
  metadata: metadata || null,
  events: null,
  links: null,
  other: null,
  startTime: startTime || new Date().getTime(),
  endTime: 0,
  createdAt: createdAt || new Date(),
  input: null,
  output: null,
  error: null,
});

export const createSampleAgentRunSpan = (
  name: string,
  scope?: Record<string, any> | undefined,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): Omit<AISpanDatabaseRecord, 'id'> =>
  createSampleAiSpan(name, 0, scope, attributes, metadata, createdAt);

export const createSampleLLMSpan = (
  name: string,
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): Omit<AISpanDatabaseRecord, 'id'> =>
  createSampleAiSpan(name, 1, scope, attributes, metadata, createdAt);

export const createSampleToolSpan = (
  name: string,
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): Omit<AISpanDatabaseRecord, 'id'> =>
  createSampleAiSpan(name, 2, scope, attributes, metadata, createdAt);

export const createSampleWorkflowSpan = (
  name: string,
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): Omit<AISpanDatabaseRecord, 'id'> =>
  createSampleAiSpan(name, 3, scope, attributes, metadata, createdAt);

// Utility to create a span hierarchy with proper parent-child relationships
export const createSpanHierarchy = (
  parentName: string,
  childNames: string[] = [],
  options: {
    parentSpanType?: number;
    childSpanType?: number;
    scope?: Record<string, any>;
    attributes?: Record<string, any>;
    metadata?: Record<string, any>;
    createdAt?: Date;
    startTime?: number;
    endTime?: number;
  } = {}
): {
  parent: Omit<AISpanDatabaseRecord, 'id'>;
  children: Array<Omit<AISpanDatabaseRecord, 'id'>>;
} => {
  const {
    parentSpanType = 0,
    childSpanType = 0,
    scope,
    attributes,
    metadata,
    createdAt,
    startTime
  } = options;

  // Create parent span
  const parent = createSampleAiSpan(
    parentName,
    parentSpanType,
    scope,
    attributes,
    metadata,
    createdAt,
    startTime
  );

  // Create child spans with the same traceId as parent
  const children = childNames.map(childName => {
    const child = createSampleAiSpan(
      childName,
      childSpanType,
      scope,
      attributes,
      metadata,
      createdAt,
      startTime
    );
    
    // Override the traceId to match the parent
    (child as any).traceId = parent.traceId;
    
    return child;
  });

  return { parent, children };
};

// Utility to create multiple span hierarchies for testing pagination
export const createMultipleSpanHierarchies = (
  count: number,
  options: {
    parentNamePrefix?: string;
    childNames?: string[];
    parentSpanType?: number;
    childSpanType?: number;
    scope?: Record<string, any>;
    attributes?: Record<string, any>;
    metadata?: Record<string, any>;
    createdAt?: Date;
    startTime?: number;
    endTime?: number;
  } = {}
): Array<{
  parent: Omit<AISpanDatabaseRecord, 'id'>;
  children: Array<Omit<AISpanDatabaseRecord, 'id'>>;
}> => {
  const {
    parentNamePrefix = 'parent',
    childNames = ['child-1', 'child-2'],
    parentSpanType = 0,
    childSpanType = 0,
    scope,
    attributes,
    metadata,
    createdAt,
    startTime,
    endTime
  } = options;

  return Array.from({ length: count }, (_, i) =>
    createSpanHierarchy(
      `${parentNamePrefix}-${i}`,
      childNames.map(name => `${name}-${i}`),
      {
        parentSpanType,
        childSpanType,
        scope,
        attributes,
        metadata,
        createdAt,
        startTime,
        endTime
      }
    )
  );
};
