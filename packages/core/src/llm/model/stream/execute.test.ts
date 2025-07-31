import type { ReadableStream } from 'stream/web';
import { describe, expect, it } from 'vitest';
import { convertReadableStreamToArray, MockLanguageModelV2 } from 'ai-v5/test';
import { fullStreamTests } from './ai-sdk/test-utils/v4/fullStream';
import { mergeIntoDataStreamTests } from './ai-sdk/test-utils/v4/mergeIntoDataStream';
import { optionsTests } from './ai-sdk/test-utils/v4/options';
import { resultObjectTests } from './ai-sdk/test-utils/v4/result-object';
import { textStreamTests } from './ai-sdk/test-utils/v4/textStream';
import { toDataStreamResponseTests } from './ai-sdk/test-utils/v4/toDataStreamResponse';
import { createTestModel, defaultSettings, testUsage } from './ai-sdk/test-utils/v5/test-utils';
import { execute } from './execute';
import { convertArrayToReadableStream, convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';

const runId = '12345';

describe('V4 tests', () => {
  optionsTests({ executeFn: execute, runId });

  resultObjectTests({ executeFn: execute, runId });

  textStreamTests({
    executeFn: execute,
    runId,
  });

  fullStreamTests({ executeFn: execute, runId });

  toDataStreamResponseTests({
    executeFn: execute,
    runId,
  });

  mergeIntoDataStreamTests({
    executeFn: execute,
    runId,
  });
});

describe('V5 tests', () => {
  describe('result.textStream', () => {
    it('should send text deltas', async () => {
      const result = await execute({
        runId: 'test',
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            console.dir({ prompt }, { depth: null });
            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                // providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual(['Hello', ', ', 'world!']);
    });
  });

  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = await execute({
        runId: 'test',
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
                // providerOptions: undefined,
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'response-id',
                  modelId: 'response-model-id',
                  timestamp: new Date(5000),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
      });

      const data = await convertAsyncIterableToArray(result.aisdk.v5.fullStream);
      console.dir({ data }, { depth: null });
      expect(data).toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Hello",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": ", ",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "world!",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "response-id",
                "modelId": "response-model-id",
                "timestamp": 1970-01-01T00:00:05.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
            },
            {
              "finishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "type": "finish",
            },
          ]
        `);
    });
  });

  describe('result.toUIMessageStream', () => {
    it('should create a ui message stream', async () => {
      const result = await execute({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
          [
            {
              "type": "start",
            },
            {
              "type": "start-step",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "delta": "Hello",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": ", ",
              "id": "1",
              "type": "text-delta",
            },
            {
              "delta": "world!",
              "id": "1",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "type": "finish-step",
            },
            {
              "type": "finish",
            },
          ]
        `);
    });
  });
});
