import { convertArrayToReadableStream, convertReadableStreamToArray, mockId } from '@ai-sdk/provider-utils/test';
import { mockValues } from 'ai-v5/test';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { execute } from '../../../execute';
import {
  createTestModel,
  defaultSettings,
  modelWithDocumentSources,
  modelWithFiles,
  modelWithReasoning,
  modelWithSources,
  testUsage,
} from './test-utils';

export function toUIMessageStreamTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.toUIMessageStream', () => {
    it('should create a ui message stream', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": ", ",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": "world!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should create a ui message stream with provider metadata', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            {
              type: 'stream-start',
              warnings: [],
            },
            {
              type: 'reasoning-start',
              id: 'r1',
              providerMetadata: { testProvider: { signature: 'r1' } },
            },
            {
              type: 'reasoning-delta',
              id: 'r1',
              delta: 'Hello',
              providerMetadata: { testProvider: { signature: 'r2' } },
            },
            {
              type: 'reasoning-delta',
              id: 'r1',
              delta: ', ',
              providerMetadata: { testProvider: { signature: 'r3' } },
            },
            {
              type: 'reasoning-end',
              id: 'r1',
              providerMetadata: { testProvider: { signature: 'r4' } },
            },
            {
              type: 'text-start',
              id: '1',
              providerMetadata: { testProvider: { signature: '1' } },
            },
            {
              type: 'text-delta',
              id: '1',
              delta: 'Hello',
              providerMetadata: { testProvider: { signature: '2' } },
            },
            {
              type: 'text-delta',
              id: '1',
              delta: ', ',
              providerMetadata: { testProvider: { signature: '3' } },
            },
            {
              type: 'text-delta',
              id: '1',
              delta: 'world!',
              providerMetadata: { testProvider: { signature: '4' } },
            },
            {
              type: 'text-end',
              id: '1',
              providerMetadata: { testProvider: { signature: '5' } },
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "id": "r1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "r1",
                    },
                  },
                  "type": "reasoning-start",
                },
                {
                  "delta": "Hello",
                  "id": "r1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "r2",
                    },
                  },
                  "type": "reasoning-delta",
                },
                {
                  "delta": ", ",
                  "id": "r1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "r3",
                    },
                  },
                  "type": "reasoning-delta",
                },
                {
                  "id": "r1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "r4",
                    },
                  },
                  "type": "reasoning-end",
                },
                {
                  "id": "1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "type": "text-start",
                },
                {
                  "delta": "Hello",
                  "id": "1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "2",
                    },
                  },
                  "type": "text-delta",
                },
                {
                  "delta": ", ",
                  "id": "1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "3",
                    },
                  },
                  "type": "text-delta",
                },
                {
                  "delta": "world!",
                  "id": "1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "4",
                    },
                  },
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "5",
                    },
                  },
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should send tool call, tool call stream start, tool call deltas, and tool result stream parts', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'tool-input-start', id: 'call-1', toolName: 'tool1' },
            { type: 'tool-input-delta', id: 'call-1', delta: '{ "value":' },
            { type: 'tool-input-delta', id: 'call-1', delta: ' "value" }' },
            { type: 'tool-input-end', id: 'call-1' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        ...defaultSettings(),
      });

      expect(await convertReadableStreamToArray(result.aisdk.v5.toUIMessageStream())).toMatchSnapshot();
    });

    it('should send message metadata as defined in the metadata function', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({
        messageMetadata: mockValues(
          { key1: 'value1' },
          { key2: 'value2' },
          { key3: 'value3' },
          { key4: 'value4' },
          { key5: 'value5' },
          { key6: 'value6' },
          { key7: 'value7' },
          { key8: 'value8' },
        ),
      });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "messageMetadata": {
                    "key1": "value1",
                  },
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "messageMetadata": {
                    "key2": "value2",
                  },
                  "type": "message-metadata",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "messageMetadata": {
                    "key3": "value3",
                  },
                  "type": "message-metadata",
                },
                {
                  "delta": "Hello",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "messageMetadata": {
                    "key4": "value4",
                  },
                  "type": "message-metadata",
                },
                {
                  "delta": ", ",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "messageMetadata": {
                    "key5": "value5",
                  },
                  "type": "message-metadata",
                },
                {
                  "delta": "world!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "messageMetadata": {
                    "key6": "value6",
                  },
                  "type": "message-metadata",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "messageMetadata": {
                    "key7": "value7",
                  },
                  "type": "message-metadata",
                },
                {
                  "type": "finish-step",
                },
                {
                  "messageMetadata": {
                    "key8": "value8",
                  },
                  "type": "message-metadata",
                },
                {
                  "messageMetadata": {
                    "key8": "value8",
                  },
                  "type": "finish",
                },
              ]
            `);
    });

    it('should mask error messages by default', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        ...defaultSettings(),
        options: {
          onError: () => {},
        },
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchSnapshot();
    });

    it('should support custom error messages', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([{ type: 'error', error: 'error' }]),
        }),
        ...defaultSettings(),
        options: {
          onError: () => {},
        },
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({
        onError: error => `custom error message: ${error}`,
      });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchSnapshot();
    });

    it('should omit message finish event when sendFinish is false', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, World!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({ sendFinish: false });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello, World!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
              ]
            `);
    });

    it('should omit message start event when sendStart is false', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello, World!' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
            },
          ]),
        }),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({ sendStart: false });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start-step",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello, World!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should send reasoning content when sendReasoning is true', async () => {
      const result = await executeFn({
        runId,
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({ sendReasoning: true });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "id": "1",
                  "type": "reasoning-start",
                },
                {
                  "delta": "I will open the conversation",
                  "id": "1",
                  "type": "reasoning-delta",
                },
                {
                  "delta": " with witty banter.",
                  "id": "1",
                  "type": "reasoning-delta",
                },
                {
                  "delta": "",
                  "id": "1",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "type": "reasoning-delta",
                },
                {
                  "id": "1",
                  "type": "reasoning-end",
                },
                {
                  "id": "2",
                  "providerMetadata": {
                    "testProvider": {
                      "redactedData": "redacted-reasoning-data",
                    },
                  },
                  "type": "reasoning-start",
                },
                {
                  "id": "2",
                  "type": "reasoning-end",
                },
                {
                  "id": "3",
                  "type": "reasoning-start",
                },
                {
                  "delta": " Once the user has relaxed,",
                  "id": "3",
                  "type": "reasoning-delta",
                },
                {
                  "delta": " I will pry for valuable information.",
                  "id": "3",
                  "type": "reasoning-delta",
                },
                {
                  "id": "3",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "type": "reasoning-end",
                },
                {
                  "id": "4",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "type": "reasoning-start",
                },
                {
                  "delta": " I need to think about",
                  "id": "4",
                  "type": "reasoning-delta",
                },
                {
                  "delta": " this problem carefully.",
                  "id": "4",
                  "type": "reasoning-delta",
                },
                {
                  "id": "5",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "type": "reasoning-start",
                },
                {
                  "delta": " The best solution",
                  "id": "5",
                  "type": "reasoning-delta",
                },
                {
                  "delta": " requires careful",
                  "id": "5",
                  "type": "reasoning-delta",
                },
                {
                  "delta": " consideration of all factors.",
                  "id": "5",
                  "type": "reasoning-delta",
                },
                {
                  "id": "4",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "0987654321",
                    },
                  },
                  "type": "reasoning-end",
                },
                {
                  "id": "5",
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "0987654321",
                    },
                  },
                  "type": "reasoning-end",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hi",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": " there!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should send source content when sendSources is true', async () => {
      const result = await executeFn({
        runId,
        model: modelWithSources,
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({ sendSources: true });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "providerMetadata": {
                    "provider": {
                      "custom": "value",
                    },
                  },
                  "sourceId": "123",
                  "title": "Example",
                  "type": "source-url",
                  "url": "https://example.com",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "providerMetadata": {
                    "provider": {
                      "custom": "value2",
                    },
                  },
                  "sourceId": "456",
                  "title": "Example 2",
                  "type": "source-url",
                  "url": "https://example.com/2",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should send document source content when sendSources is true', async () => {
      const result = await executeFn({
        runId,
        model: modelWithDocumentSources,
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({ sendSources: true });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "filename": "example.pdf",
                  "mediaType": "application/pdf",
                  "providerMetadata": {
                    "provider": {
                      "custom": "doc-value",
                    },
                  },
                  "sourceId": "doc-123",
                  "title": "Document Example",
                  "type": "source-document",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello from document!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "filename": undefined,
                  "mediaType": "text/plain",
                  "providerMetadata": {
                    "provider": {
                      "custom": "doc-value2",
                    },
                  },
                  "sourceId": "doc-456",
                  "title": "Text Document",
                  "type": "source-document",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should send file content', async () => {
      const result = await executeFn({
        runId,
        model: modelWithFiles,
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream();

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,Hello World",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "mediaType": "image/jpeg",
                  "type": "file",
                  "url": "data:image/jpeg;base64,QkFVRw==",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should not generate a new message id when onFinish is provided and generateMessageId is not provided', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({
        onFinish: () => {}, // provided onFinish should trigger a new message id
      });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": ", ",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": "world!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });

    it('should generate a new message id when generateMessageId is provided', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      const uiMessageStream = result.aisdk.v5.toUIMessageStream({
        generateMessageId: mockId({ prefix: 'message' }),
      });

      expect(await convertReadableStreamToArray(uiMessageStream)).toMatchInlineSnapshot(`
              [
                {
                  "messageId": "message-0",
                  "type": "start",
                },
                {
                  "type": "start-step",
                },
                {
                  "id": "1",
                  "type": "text-start",
                },
                {
                  "delta": "Hello",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": ", ",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "delta": "world!",
                  "id": "1",
                  "type": "text-delta",
                },
                {
                  "id": "1",
                  "type": "text-end",
                },
                {
                  "type": "finish-step",
                },
                {
                  "type": "finish",
                },
              ]
            `);
    });
  });
}
