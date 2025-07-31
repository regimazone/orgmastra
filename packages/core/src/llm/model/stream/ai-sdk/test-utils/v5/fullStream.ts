import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai-v5/test';
import { describe, expect, it } from 'vitest';
import type { execute } from '../../../execute';
import { testUsage } from './test-utils';

export function fullStreamTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = await executeFn({
        runId,
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
}
