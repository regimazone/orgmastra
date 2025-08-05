import { delay } from '@ai-sdk/provider-utils';
import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { tool } from 'ai-v5';
import { convertArrayToReadableStream, MockLanguageModelV2, mockValues } from 'ai-v5/test';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { execute } from '../../../execute';
import {
  createTestModel,
  defaultSettings,
  modelWithFiles,
  modelWithReasoning,
  modelWithSources,
  testUsage,
  testUsage2,
} from './test-utils';

export function streamObjectTestsV5({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {}
