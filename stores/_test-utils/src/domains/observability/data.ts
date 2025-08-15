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
): AISpanDatabaseRecord => ({
  id: `span-${randomUUID()}`,
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
): AISpanDatabaseRecord => 
  createSampleAiSpan(name, 0, scope, attributes, metadata, createdAt);

export const createSampleLLMSpan = (
  name: string,
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): AISpanDatabaseRecord => 
  createSampleAiSpan(name, 1, scope, attributes, metadata, createdAt);

export const createSampleToolSpan = (
  name: string,
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): AISpanDatabaseRecord => 
  createSampleAiSpan(name, 2, scope, attributes, metadata, createdAt);

export const createSampleWorkflowSpan = (
  name: string,
  scope?: Record<string, any>,
  attributes?: Record<string, any>,
  metadata?: Record<string, any>,
  createdAt?: Date,
): AISpanDatabaseRecord => 
  createSampleAiSpan(name, 3, scope, attributes, metadata, createdAt);
