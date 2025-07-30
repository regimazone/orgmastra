import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { StreamData } from 'ai';
import { mockId } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { execute } from '../../../execute';
import { mergeStreams, writeToServerResponse } from '../../v4/compat';
import {
  createMockServerResponse,
  createTestModel,
  defaultSettings,
  modelWithFiles,
  modelWithReasoning,
  modelWithSources,
} from './test-utils';

export function toDataStreamResponseTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.toDataStreamResponse', () => {
    it('should create a Response with a data stream', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.aisdk.v4.toDataStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      });
      expect(response.headers.get('Content-Type')).toStrictEqual('text/plain; charset=utf-8');
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.aisdk.v4.toDataStreamResponse({
        status: 201,
        statusText: 'foo',
        headers: {
          'custom-header': 'custom-value',
        },
      });

      expect(response.status).toStrictEqual(201);
      expect(response.statusText).toStrictEqual('foo');
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
        'custom-header': 'custom-value',
      });
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close().catch(() => {});

      const response = result.aisdk.v4.toDataStreamResponse({ data: streamData });

      expect(response.status).toStrictEqual(200);
      expect(response.headers.get('Content-Type')).toStrictEqual('text/plain; charset=utf-8');
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.aisdk.v4.toDataStreamResponse();

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.aisdk.v4.toDataStreamResponse({
        getErrorMessage: (error: string) => `custom error message: ${error}`,
      });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = await executeFn({
        runId,
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
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.aisdk.v4.toDataStreamResponse({ sendUsage: false });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });
  });

  describe('result.pipeDataStreamToResponse', async () => {
    it('should write data stream parts to a Node.js response-like object', async () => {
      const mockResponse = createMockServerResponse();

      const result = await executeFn({
        runId,
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      await writeToServerResponse({
        response: mockResponse,
        stream: result.aisdk.v4
          .toDataStream({ sendReasoning: false, sendSources: false })
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

      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
          ]),
        }),
        prompt: 'test-input',
      });

      await writeToServerResponse({
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
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const dataStream = result.aisdk.v4
        .toDataStream({ sendReasoning: false, sendSources: false })
        .pipeThrough(new TextEncoderStream() as any) as any;

      expect(await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream()))).toMatchSnapshot();
    });

    it('should support merging with existing stream data', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close().catch(() => {});

      let dataStream = result.aisdk.v4.toDataStream().pipeThrough(new TextEncoderStream() as any) as any;

      dataStream = mergeStreams(streamData.stream, dataStream);

      expect(await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream()))).toMatchSnapshot();
    });

    it('should send tool call and tool result stream parts', async () => {
      const result = await executeFn({
        runId,
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
            execute: async ({ value }: { value: string }) => `${value}-result`,
          },
        },
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result.aisdk.v4
            .toDataStream()
            .pipeThrough(new TextEncoderStream() as any)
            .pipeThrough(new TextDecoderStream() as any) as any,
        ),
      ).toMatchSnapshot();
    });

    it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts when tool call delta flag is enabled', async () => {
      const result = await executeFn({
        runId,
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
            execute: async ({ value }: { value: string }) => `${value}-result`,
          },
        },
        toolCallStreaming: true,
        ...defaultSettings(),
      });

      expect(
        await convertReadableStreamToArray(
          result.aisdk.v4
            .toDataStream()
            .pipeThrough(new TextEncoderStream() as any)
            .pipeThrough(new TextDecoderStream() as any) as any,
        ),
      ).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.aisdk.v4.toDataStream().pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        ...defaultSettings(),
      });

      const dataStream = result.aisdk.v4
        .toDataStream({
          getErrorMessage: (error: string) => `custom error message: ${error}`,
        })
        .pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = await executeFn({
        runId,
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

      const dataStream = result.aisdk.v4.toDataStream({ sendUsage: false }).pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should omit message finish event (d:) when sendFinish is false', async () => {
      const result = await executeFn({
        runId,
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

      const dataStream = result.aisdk.v4
        .toDataStream({
          experimental_sendFinish: false,
        })
        .pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should send reasoning content when sendReasoning is true', async () => {
      const result = await executeFn({
        runId,
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      const dataStream = result.aisdk.v4
        .toDataStream({ sendReasoning: true })
        .pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should send source content when sendSources is true', async () => {
      const result = await executeFn({
        runId,
        model: modelWithSources,
        ...defaultSettings(),
      });

      const dataStream = result.aisdk.v4
        .toDataStream({ sendSources: true })
        .pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });

    it('should send file content', async () => {
      const result = await executeFn({
        runId,
        model: modelWithFiles,
        ...defaultSettings(),
      });

      const dataStream = result.aisdk.v4.toDataStream().pipeThrough(new TextEncoderStream() as any);

      expect(
        await convertReadableStreamToArray(dataStream.pipeThrough(new TextDecoderStream() as any) as any),
      ).toMatchSnapshot();
    });
  });
}
