import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
  convertResponseStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createDataStream } from 'ai';
import { mockId } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { createTestModel } from '../../test-utils';
import type { AgenticLoop } from '../../vnext';

export function mergeIntoDataStreamTests({ engine }: { engine: AgenticLoop }) {
  describe('result.mergeIntoDataStream', () => {
    it('should merge the result into a data stream', async () => {
      const result = await engine.loop({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.mergeIntoDataStream(writer);
        },
      });

      const data = await convertReadableStreamToArray(dataStream);

      console.log(data);

      expect(data).toMatchSnapshot();
    });

    it('should use the onError handler from the data stream', async () => {
      const result = await engine.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const dataStream = createDataStream({
        execute(writer) {
          result.mergeIntoDataStream(writer);
        },
        onError: error => `custom error message: ${error}`,
      });

      expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
    });
  });

  describe('result.toTextStreamResponse', () => {
    it('should create a Response with a text stream', async () => {
      const result = await engine.loop({
        model: createTestModel(),
        prompt: 'test-input',
      });

      const response = result.toTextStreamResponse();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
      });
      expect(await convertResponseStreamToArray(response)).toStrictEqual(['Hello', ', ', 'world!']);
    });
  });

  describe.skip('result.consumeStream', () => {
    it('should ignore AbortError during stream consumption', async () => {
      const result = await engine.loop({
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

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore ResponseAborted error during stream consumption', async () => {
      const result = await engine.loop({
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

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should ignore any errors during stream consumption', async () => {
      const result = await engine.loop({
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

      await expect(result.consumeStream()).resolves.not.toThrow();
    });

    it('should call the onError callback with the error', async () => {
      const onErrorCallback = vi.fn();
      const result = await engine.loop({
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

      await expect(result.consumeStream({ onError: onErrorCallback })).resolves.not.toThrow();
      expect(onErrorCallback).toHaveBeenCalledWith(new Error('Some error'));
    });
  });

  describe('multiple stream consumption', () => {
    it.only('should support text stream, ai stream, full stream on single result object', async () => {
      const result = await engine.loop({
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

      // const textStreamArray = await convertAsyncIterableToArray(textStream);

      // console.log(textStreamArray);

      const fullStream = result.toFullStreamV4;

      for await (const chunk of fullStream) {
        console.log(chunk);
      }

      const textStream = result.textStream;

      for await (const chunk of textStream) {
        console.log(chunk);
      }

      // const fullStreamArray = await convertAsyncIterableToArray(fullStream);

      // console.log(fullStreamArray);

      // expect({
      //     textStream: textStreamArray,
      //     fullStream: fullStreamArray,
      // }).toMatchSnapshot();

      // expect({
      //     textStream: await convertAsyncIterableToArray(textStream),
      //     fullStream: await convertAsyncIterableToArray(result.toFullStreamV4),
      //     // dataStream: await convertReadableStreamToArray(
      //     //     result.toFullStreamV4.pipeThrough(new TextEncoderStream()).pipeThrough(new TextDecoderStream()),
      //     // ),
      // }).toMatchSnapshot();
    });
  });
}
