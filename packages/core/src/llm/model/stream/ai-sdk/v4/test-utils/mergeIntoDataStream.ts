import { TextEncoderStream } from 'stream/web';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createDataStream } from 'ai';
import { mockId } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import type { execute } from '../../../execute';
import { createTestModel } from './test-utils';

export function mergeIntoDataStreamTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.mergeIntoDataStream', () => {
    it('should merge the result into a data stream', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.aisdk.v4.mergeIntoDataStream(writer);
        },
      });

      const data = await convertReadableStreamToArray(dataStream);

      console.log(data);

      expect(data).toMatchSnapshot();
    });

    it('should use the onError handler from the data stream', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.aisdk.v4.mergeIntoDataStream(writer);
        },
        onError: error => `custom error message: ${error}`,
      });

      expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
    });
  });

  describe('result.toTextStreamResponse', () => {
    it('should create a Response with a text stream', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        prompt: 'test-input',
      });

      const response = result.aisdk.v4.toTextStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
      });
      expect(await convertResponseStreamToArray(response)).toStrictEqual(['Hello', ', ', 'world!']);
    });
  });

  describe('result.consumeStream', () => {
    it('should ignore AbortError during stream consumption', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(
                  Object.assign(new Error('Stream aborted'), {
                    name: 'AbortError',
                  }),
                );
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.aisdk.v4.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore ResponseAborted error during stream consumption', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(
                  Object.assign(new Error('Response aborted'), {
                    name: 'ResponseAborted',
                  }),
                );
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.aisdk.v4.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore any errors during stream consumption', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(Object.assign(new Error('Some error')));
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.aisdk.v4.consumeStream()).resolves.not.toThrow();
    });

    it.skip('should call the onError callback with the error', async () => {
      const onErrorCallback = vi.fn();
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
              queueMicrotask(() => {
                controller.error(Object.assign(new Error('Some error')));
              });
            },
          }),
        }),
        prompt: 'test-input',
      });

      await expect(result.aisdk.v4.consumeStream({ onError: onErrorCallback })).resolves.not.toThrow();
      expect(onErrorCallback).toHaveBeenCalledWith(new Error('Some error'));
    });
  });

  describe('multiple stream consumption', () => {
    it('should support text stream, ai stream, full stream on single result object', async () => {
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
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: 'world!' },
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

      expect({
        textStream: await convertAsyncIterableToArray(result.textStream),
        fullStream: await convertAsyncIterableToArray(result.aisdk.v4.fullStream),
        dataStream: await convertReadableStreamToArray(
          result.aisdk.v4
            .toDataStream()
            .pipeThrough(new TextEncoderStream() as any)
            .pipeThrough(new TextDecoderStream() as any) as any,
        ),
      }).toMatchSnapshot();
    });
  });
}
