import type { ReadableStream } from 'stream/web';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV2 } from 'ai-v5/test';
import { fullStreamTests } from './ai-sdk/test-utils/v4/fullStream';
import { mergeIntoDataStreamTests } from './ai-sdk/test-utils/v4/mergeIntoDataStream';
import { optionsTests } from './ai-sdk/test-utils/v4/options';
import { resultObjectTests } from './ai-sdk/test-utils/v4/result-object';
import { textStreamTests } from './ai-sdk/test-utils/v4/textStream';
import { toDataStreamResponseTests } from './ai-sdk/test-utils/v4/toDataStreamResponse';
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
    it.only('should send text deltas', async () => {
      const result = await execute({
        runId: 'test',
        model: new MockLanguageModelV2({
          doStream: async ({ prompt }) => {
            // expect(prompt).toStrictEqual([
            //   {
            //     role: 'user',
            //     content: [{ type: 'text', text: 'test-input' }],
            //     providerOptions: undefined,
            //   },
            // ]);

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
                  usage: {
                    inputTokens: 10,
                    outputTokens: 10,
                    totalTokens: 20,
                    promptTokens: 10,
                    completionTokens: 10,
                  },
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
});
