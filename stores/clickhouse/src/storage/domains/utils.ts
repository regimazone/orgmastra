import type { ClickHouseClient } from '@clickhouse/client';
import type { IMastraLogger } from '@mastra/core/logger';

export function createExecuteWriteOperationWithRetry({
  logger,
  maxRetries,
  initialBackoffMs,
}: {
  logger: IMastraLogger;
  maxRetries: number;
  initialBackoffMs: number;
}) {
  return async function executeWriteOperationWithRetry<T>(
    operationFn: () => Promise<T>,
    operationDescription: string,
  ): Promise<T> {
    let retries = 0;

    while (true) {
      try {
        return await operationFn();
      } catch (error: any) {
        if (
          error.message &&
          (error.message.includes('CONNECTION_ERROR') || error.message.includes('TIMEOUT')) &&
          retries < maxRetries
        ) {
          retries++;
          const backoffTime = initialBackoffMs * Math.pow(2, retries - 1);
          logger.warn(
            `ClickHouseStore: Encountered connection error during ${operationDescription}. Retrying (${retries}/${maxRetries}) in ${backoffTime}ms...`,
          );
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
          logger.error(`ClickHouseStore: Error during ${operationDescription} after ${retries} retries: ${error}`);
          throw error;
        }
      }
    }
  };
}

export function transformDates(record: Record<string, any>): Record<string, any> {
  const transformed = { ...record };
  
  // Handle common date fields
  if (transformed.createdAt && transformed.createdAt instanceof Date) {
    transformed.createdAt = transformed.createdAt.toISOString();
  }
  if (transformed.updatedAt && transformed.updatedAt instanceof Date) {
    transformed.updatedAt = transformed.updatedAt.toISOString();
  }
  
  return transformed;
}

export function parseRowDates<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  
  const parsed = { ...row };
  
  if (parsed.createdAt && typeof parsed.createdAt === 'string') {
    parsed.createdAt = new Date(parsed.createdAt);
  }
  if (parsed.updatedAt && typeof parsed.updatedAt === 'string') {
    parsed.updatedAt = new Date(parsed.updatedAt);
  }
  
  return parsed;
}

export function safelyParseJSON(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch {
    return {};
  }
}