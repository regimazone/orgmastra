import { convertArrayToReadableStream, convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import { tool } from 'ai';
import { MockLanguageModelV1, mockId, mockValues } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { delay } from '../../../../../../utils';
import { createTestModel, defaultSettings, modelWithFiles, modelWithReasoning, modelWithSources } from './test-utils';
import type { execute } from '../../../execute';

export function fullStreamTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
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
                {
                  type: 'response-metadata',
                  id: 'response-id',
                  modelId: 'response-model-id',
                  timestamp: new Date(5000),
                },
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
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const messages = await convertAsyncIterableToArray(result.aisdk.v4.fullStream);
      console.dir({ messages }, { depth: null });

      expect(messages).toMatchSnapshot();
    });

    it('should send reasoning deltas', async () => {
      const result = await executeFn({
        runId,
        model: modelWithReasoning,
        system: 'You are a helpful assistant.',
        prompt: 'test-input',
        threadId: '123',
        resourceId: '456',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
    });

    it('should send sources', async () => {
      const result = await executeFn({
        runId,
        model: modelWithSources,
        system: 'You are a helpful assistant.',
        threadId: '123',
        resourceId: '456',
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
    });

    it('should send files', async () => {
      const result = await executeFn({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
    });

    it('should use fallback response metadata when response metadata is not provided', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
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
        }),
        prompt: 'test-input',
        _internal: {
          currentDate: mockValues(new Date(2000)),
          generateId: mockValues('id-2000'),
        },
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const messages = await convertAsyncIterableToArray(result.aisdk.v4.fullStream);

      expect(messages).toMatchSnapshot();
    });

    it('should send tool calls', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async ({ prompt, mode }) => {
            expect(mode).toStrictEqual({
              type: 'regular',
              tools: [
                {
                  type: 'function',
                  name: 'tool1',
                  description: undefined,
                  parameters: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    additionalProperties: false,
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    type: 'object',
                  },
                },
              ],
              toolChoice: { type: 'required' },
            });

            expect(prompt).toStrictEqual([
              {
                role: 'user',
                content: [{ type: 'text', text: 'test-input' }],
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'tool1',
                  args: `{ "value": "value" }`,
                },
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
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
          },
        },
        toolChoice: 'required',
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
    });

    it('should send tool results', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: tool({
            parameters: z.object({ value: z.string() }),
            execute: async (args, options) => {
              expect(args).toStrictEqual({ value: 'value' });
              expect(options.messages).toStrictEqual([{ role: 'user', content: 'test-input' }]);
              return `${args.value}-result`;
            },
          }),
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const messages = await convertAsyncIterableToArray(result.aisdk.v4.fullStream);

      expect(messages).toMatchSnapshot();
    });

    it('should send delayed asynchronous tool results', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'call-1',
              toolName: 'tool1',
              args: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async ({ value }) => {
              await delay(50); // delay to show bug where step finish is sent before tool result
              return `${value}-result`;
            },
          },
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
    });

    it('should filter out empty text deltas', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'id-0',
              modelId: 'mock-model-id',
              timestamp: new Date(0),
            },
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
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
    });

    it('should forward error in doStream as error stream part', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });
}
