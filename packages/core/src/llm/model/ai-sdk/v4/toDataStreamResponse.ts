import { convertArrayToReadableStream, convertResponseStreamToArray } from '@ai-sdk/provider-utils/test';
import { StreamData } from 'ai';
import { mockId } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createTestModel } from '../../test-utils';

export function toDataStreamResponseTests({ engine }: { engine: any; version: 'v4' }) {
  describe('result.toDataStreamResponse', () => {
    it('should create a Response with a data stream', async () => {
      const result = await engine.loop({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponseV4();

      expect(response.status).toStrictEqual(200);
      expect(Object.fromEntries(response.headers.entries())).toStrictEqual({
        'content-type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1',
      });
      expect(response.headers.get('Content-Type')).toStrictEqual('text/plain; charset=utf-8');
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should create a Response with a data stream and custom headers', async () => {
      const result = await engine.loop({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponseV4({
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
      const result = await engine.loop({
        model: createTestModel(),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const streamData = new StreamData();
      streamData.append('stream-data-value');
      streamData.close().catch(() => {});

      const response = result.toDataStreamResponseV4({ data: streamData });

      expect(response.status).toStrictEqual(200);
      expect(response.headers.get('Content-Type')).toStrictEqual('text/plain; charset=utf-8');
      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should mask error messages by default', async () => {
      const result = await engine.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponseV4();

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = await engine.loop({
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const response = result.toDataStreamResponseV4({
        getErrorMessage: (error: string) => `custom error message: ${error}`,
      });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });

    it('should suppress usage information when sendUsage is false', async () => {
      const result = await engine.loop({
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

      const response = result.toDataStreamResponseV4({ sendUsage: false });

      expect(await convertResponseStreamToArray(response)).toMatchSnapshot();
    });
  });
}
