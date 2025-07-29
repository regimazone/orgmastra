import type { TextStreamPart } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV1 } from 'ai/test';
import { describe, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestModel, defaultSettings, modelWithFiles, modelWithSources } from '../../../../test-utils';
import type { execute } from '../../../execute';
import { convertFullStreamChunkToAISDKv4 } from '../../v4';
import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';

export function optionsTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe.skip('options.onChunk', () => {
    let result: Array<
      Extract<
        TextStreamPart<any>,
        {
          type:
            | 'text-delta'
            | 'reasoning'
            | 'source'
            | 'tool-call'
            | 'tool-call-streaming-start'
            | 'tool-call-delta'
            | 'tool-result';
        }
      >
    >;

    beforeEach(async () => {
      result = [];
      const resultObject = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{"value": "',
            },
            {
              type: 'reasoning',
              textDelta: 'Feeling clever',
            },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: 'test',
            },
            {
              type: 'tool-call-delta',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '"}',
            },
            {
              type: 'source',
              source: {
                sourceType: 'url' as const,
                id: '123',
                url: 'https://example.com',
                title: 'Example',
                providerMetadata: { provider: { custom: 'value' } },
              },
            },
            {
              type: 'tool-call',
              toolCallId: '1',
              toolCallType: 'function',
              toolName: 'tool1',
              args: `{ "value": "test" }`,
            },
            { type: 'text-delta', textDelta: ' World' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
              },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        toolCallStreaming: true,
        options: {
          onChunk(event) {
            console.log('event', event);

            const transformed = convertFullStreamChunkToAISDKv4({
              chunk: event,
              client: false,
              sendReasoning: true,
              sendSources: true,
              sendUsage: true,
              getErrorMessage: (error: string) => error,
              toolCallStreaming: true,
            });

            console.log('transformed', transformed);

            if (transformed) {
              result.push(transformed);
            }
          },
        },
      });

      await resultObject.aisdk.v4.consumeStream();
    });

    it('should return events in order', async () => {
      expect(result).toMatchSnapshot();
    });
  });

  describe('options.onError', () => {
    it('should invoke onError', async () => {
      const result: Array<{ error: unknown }> = [];

      const resultObject = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        options: {
          onError(event) {
            console.log('ON ERROR FUNC', event);
            result.push(event);
          },
        },
      });

      await resultObject.aisdk.v4.consumeStream();

      expect(result).toStrictEqual([{ error: new Error('test error') }]);
    });
  });

  describe('options.onFinish', () => {
    it('should send correct information', async () => {
      let result!: any;

      const resultObject = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            { type: 'text-delta', textDelta: `world!` },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        options: {
          onFinish: async event => {
            console.log(JSON.stringify(event, null, 2), 'MESSAGES in ONFINISH');
            result = event as unknown as typeof result;
          },
        },
        ...defaultSettings(),
      });

      await resultObject.aisdk.v4.consumeStream();

      console.log('result', JSON.stringify(result, null, 2));

      expect(result).toMatchSnapshot();
    });

    it('should send sources', async () => {
      let result!: any;

      const resultObject = await executeFn({
        runId,
        model: modelWithSources,
        options: {
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
        },
        ...defaultSettings(),
      });

      await resultObject.aisdk.v4.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should send files', async () => {
      let result!: any;

      const resultObject = await executeFn({
        runId,
        model: modelWithFiles,
        options: {
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
        },
        ...defaultSettings(),
      });

      await resultObject.aisdk.v4.consumeStream();

      expect(result).toMatchSnapshot();
    });

    it('should not prevent error from being forwarded', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        options: {
          onFinish() {}, // just defined; do nothing
        },
      });

      expect(await convertAsyncIterableToArray(result.fullStream)).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });
}
