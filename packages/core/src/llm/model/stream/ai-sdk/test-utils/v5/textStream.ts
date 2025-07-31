import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai-v5/test';
import { describe, expect, it } from 'vitest';
import type { execute } from '../../../execute';
import { testUsage } from './test-utils';

export function textStreamTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.textStream', () => {
    it('should send text deltas', async () => {
      const result = await executeFn({
        runId,
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
}
