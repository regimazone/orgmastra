import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { MockLanguageModelV1, mockId, mockValues } from 'ai/test';
import { describe, expect, it } from 'vitest';

import {
  createMockServerResponse,
  createTestModel,
  modelWithFiles,
  modelWithReasoning,
  modelWithSources,
} from './test-utils';

import { AgenticLoop } from './vnext';
import { z } from 'zod';
import { createDataStream, pipeDataStreamToResponse, StreamData, streamText, tool } from 'ai';
import { delay } from '../../utils';
import { mergeStreams, prepareOutgoingHttpHeaders, writeToServerResponse } from '../../stream/compat';

import { toDataStreamResponseTests } from './ai-sdk/v4/toDataStreamResponse';

const defaultSettings = () =>
  ({
    prompt: 'prompt',
    experimental_generateMessageId: mockId({ prefix: 'msg' }),
    _internal: {
      generateId: mockId({ prefix: 'id' }),
      currentDate: () => new Date(0),
    },
  }) as const;

const looper = new AgenticLoop();

const runId = '12345';

describe('V4 tests', () => {
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

      const result = await looper.loop({
        runId,
        model,
        system: 'You are a helpful assistant.',
        prompt: 'test-input',
        threadId: '123',
        resourceId: '456',
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual(['Hello', ', ', 'world!']);
    });

    it('should filter out empty text deltas', async () => {
      const result = await looper.loop({
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
      const result = await looper.loop({
        model: modelWithReasoning,
        runId,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toMatchSnapshot();
    });

    it('should swallow error to prevent server crash', async () => {
      const result = await looper.loop({
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

  describe('result.fullStream', () => {
    it('should send text deltas', async () => {
      const result = await looper.loop({
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

      const messages = await convertAsyncIterableToArray(result.aisdkv4);

      expect(messages).toMatchSnapshot();
    });

    it('should send reasoning deltas', async () => {
      const result = await looper.loop({
        runId,
        model: modelWithReasoning,
        system: 'You are a helpful assistant.',
        prompt: 'test-input',
        threadId: '123',
        resourceId: '456',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.aisdkv4)).toMatchSnapshot();
    });

    it('should send sources', async () => {
      const result = await looper.loop({
        runId,
        model: modelWithSources,
        system: 'You are a helpful assistant.',
        threadId: '123',
        resourceId: '456',
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.aisdkv4)).toMatchSnapshot();
    });

    it('should send files', async () => {
      const result = await looper.loop({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      expect(await convertAsyncIterableToArray(result.aisdkv4)).toMatchSnapshot();
    });

    it('should use fallback response metadata when response metadata is not provided', async () => {
      const result = await looper.loop({
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

      const messages = await convertAsyncIterableToArray(result.aisdkv4);

      expect(messages).toMatchSnapshot();
    });

    it('should send tool calls', async () => {
      const result = await looper.loop({
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

      expect(await convertAsyncIterableToArray(result.aisdkv4)).toMatchSnapshot();
    });

    it('should send tool results', async () => {
      const result = await looper.loop({
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

              console.log(JSON.stringify(options.messages, null, 2), 'MESSAGES YO');

              expect(options.messages).toStrictEqual([{ role: 'user', content: 'test-input' }]);
              return `${args.value}-result`;
            },
          }),
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const messages = await convertAsyncIterableToArray(result.aisdkv4);

      console.log(JSON.stringify(messages, null, 2), 'MESSAGES RETURN');

      expect(messages).toMatchSnapshot();
    });

    it('should send delayed asynchronous tool results', async () => {
      const result = await looper.loop({
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

      expect(await convertAsyncIterableToArray(result.aisdkv4)).toMatchSnapshot();
    });

    it('should filter out empty text deltas', async () => {
      const result = await looper.loop({
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

      expect(await convertAsyncIterableToArray(result.aisdkv4)).toMatchSnapshot();
    });

    it('should forward error in doStream as error stream part', async () => {
      const result = streamText({
        model: new MockLanguageModelV1({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
      });

      expect(await convertAsyncIterableToArray(result.fullStream)).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('result.pipeDataStreamToResponse', async () => {
    it('should write data stream parts to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = await looper.loop({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      writeToServerResponse({
        response: mockResponse,
        stream: result
          .toDataStreamV4({ sendReasoning: false, sendSources: false })
          .pipeThrough(new TextEncoderStream() as any) as any,
        headers: {
          'X-Vercel-AI-Data-Stream': 'v1',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });

      // pipeDataStreamToResponse(mockResponse)

      await mockResponse.waitForEnd();

      console.log('mockResponse', mockResponse);

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });

      console.log('mockResponse.getDecodedChunks()', mockResponse.getDecodedChunks());

      expect(mockResponse.getDecodedChunks()).toMatchSnapshot();
    });
  });

  describe('result.pipeTextStreamToResponse', async () => {
    it('should write text deltas to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
          ]),
        }),
        prompt: 'test-input',
      });

      writeToServerResponse({
        response: mockResponse,
        headers: {
          'X-Vercel-AI-Data-Stream': 'v1',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        stream: result.textStream.pipeThrough(new TextEncoderStream() as any) as any,
      });

      await mockResponse.waitForEnd();

      expect(mockResponse.statusCode).toBe(200);
      expect(mockResponse.headers).toEqual({
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Vercel-AI-Data-Stream': 'v1',
      });
      expect(mockResponse.getDecodedChunks()).toEqual(['Hello', ', ', 'world!']);
    });
  });

  describe('result.toDataStream', () => {
    it('should create a data stream', async () => {
      const result = await looper.loop({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const dataStream = result
        .toDataStreamV4({ sendReasoning: false, sendSources: false })
        .pipeThrough(new TextEncoderStream() as any) as any;

      expect(await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream()))).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = await looper.loop({
        model: createTestModel(),
        ...defaultSettings(),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close();

      let dataStream = result.toDataStreamV4().pipeThrough(new TextEncoderStream() as any) as any;

      dataStream = mergeStreams(streamData.stream, dataStream);

      expect(await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream()))).toMatchSnapshot();
    });

    it('should send tool call and tool result stream parts', async () => {
      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{ "value":',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: ' "value" }',
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
            execute: async ({ value }) => `${value}-result`,
          },
        },
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result
            .toDataStreamV4()
            .pipeThrough(new TextEncoderStream() as any)
            .pipeThrough(new TextDecoderStream() as any) as any,
        ),
      ).toMatchSnapshot();
    });

    it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts when tool call delta flag is enabled', async () => {
      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: '{ "value":',
            },
            {
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolCallType: 'function',
              toolName: 'tool1',
              argsTextDelta: ' "value" }',
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
            execute: async ({ value }) => `${value}-result`,
          },
        },
        toolCallStreaming: true,
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result
            .toDataStreamV4()
            .pipeThrough(new TextEncoderStream() as any)
            .pipeThrough(new TextDecoderStream() as any) as any,
        ),
      ).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStreamV4().pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result
        .toDataStreamV4({
          getErrorMessage: error => `custom error message: ${error}`,
        })
        .pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.toDataStreamV4({ sendUsage: false }).pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const result = await looper.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, World!' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result
        .toDataStreamV4({
          experimental_sendFinish: false,
        })
        .pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should send reasoning content when sendReasoning is true', async () => {
      const result = await looper.loop({
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStreamV4({ sendReasoning: true }).pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should send source content when sendSources is true', async () => {
      const result = await looper.loop({
        model: modelWithSources,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStreamV4({ sendSources: true }).pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should send file content', async () => {
      const result = await looper.loop({
        model: modelWithFiles,
        ...defaultSettings(),
      });

      const dataStream = result.toDataStreamV4().pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });
  });

  toDataStreamResponseTests({
    engine: looper,
    version: 'v4',
  });
});
