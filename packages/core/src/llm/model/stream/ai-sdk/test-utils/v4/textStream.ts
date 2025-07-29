import { convertArrayToReadableStream, convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { MockLanguageModelV1 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createTestModel, defaultSettings, modelWithReasoning } from '../../../../test-utils';
import type { execute } from '../../../execute';

export function textStreamTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.textStream', () => {
    it('should send text deltas', async () => {
      const model = new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          expect(mode).toStrictEqual({
            type: 'regular',
            tools: undefined,
            toolChoice: undefined,
          });

          expect(prompt).toStrictEqual([
            {
              role: 'user',
              content: [{ type: 'text', text: 'test-input' }],
              // providerMetadata: undefined,
            },
          ]);

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: `world!` },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      });

      const result = await executeFn({
        runId,
        model,
        system: 'You are a helpful assistant.',
        prompt: 'test-input',
        threadId: '123',
        resourceId: '456',
      });

      console.log(result.textStream);

      expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual(['Hello', ', ', 'world!']);
    });

    it('should filter out empty text deltas', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: '' },
            { type: 'text-delta', textDelta: 'world!' },
            { type: 'text-delta', textDelta: '' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        system: 'You are a helpful assistant.',
        prompt: 'test-input',
        threadId: '123',
        resourceId: '456',
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toMatchSnapshot();
    });

    it('should not include reasoning content in textStream', async () => {
      const result = await executeFn({
        model: modelWithReasoning,
        runId,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toMatchSnapshot();
    });

    it('should swallow error to prevent server crash', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toMatchSnapshot();
    });
  });
}
