import { convertArrayToReadableStream, mockId } from 'ai/test';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import { createTestModel, defaultSettings, modelWithFiles, modelWithReasoning, modelWithSources } from './test-utils';
import type { execute } from '../../../execute';
import { DefaultGeneratedFileWithType } from '../../v4/file';

export function resultObjectTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('result.warnings', () => {
    it('should resolve with warnings', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          warnings: [{ type: 'other', message: 'test-warning' }],
        }),
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      console.log('result.warnings', result.warnings);

      expect(result.warnings).toStrictEqual([{ type: 'other', message: 'test-warning' }]);
    });
  });

  describe('result.usage', () => {
    it('should resolve with token usage', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      expect(result.usage).toStrictEqual({
        completionTokens: 10,
        promptTokens: 3,
        totalTokens: 13,
      });
    });
  });

  describe('result.finishReason', () => {
    it('should resolve with finish reason', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
        }),
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      expect(result.finishReason).toStrictEqual('stop');
    });
  });

  describe('result.providerMetadata', () => {
    it('should resolve with provider metadata', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
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
        }),
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      expect(result.providerMetadata).toStrictEqual({
        testProvider: { testKey: 'testValue' },
      });
    });
  });

  describe('result.response.messages', () => {
    it('should contain reasoning', async () => {
      const result = await executeFn({
        runId,
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      console.log('result.response.messages', JSON.stringify(result.response.messages, null, 2));

      expect(result.response.messages).toMatchSnapshot();
    });
  });

  describe('result.request', () => {
    it('should resolve with response information', async () => {
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
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          request: { body: 'test body' },
        }),
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      expect(await result.request).toStrictEqual({
        body: 'test body',
      });
    });
  });

  describe('result.response', () => {
    it('should resolve with response information', async () => {
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
            {
              type: 'finish',
              finishReason: 'stop',
              logprobs: undefined,
              usage: { completionTokens: 10, promptTokens: 3 },
            },
          ]),
          rawResponse: { headers: { call: '2' } },
        }),
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      console.log('result.response', JSON.stringify(result.response, null, 2));

      expect(result.response).toMatchSnapshot();
    });
  });

  describe('result.text', () => {
    it('should resolve with full text', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel(),
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      expect(result.text).toMatchSnapshot();
    });
  });

  describe('result.reasoning', () => {
    it('should contain reasoning from model response', async () => {
      const result = await executeFn({
        runId,
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      expect(await result.reasoning).toMatchSnapshot();
    });
  });

  describe('result.sources', () => {
    it('should contain sources', async () => {
      const result = await executeFn({
        runId,
        model: modelWithSources,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      expect(result.sources).toMatchSnapshot();
    });
  });

  describe('result.files', () => {
    it('should contain files', async () => {
      const result = await executeFn({
        runId,
        model: modelWithFiles,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      expect(
        result.files.map(file => new DefaultGeneratedFileWithType({ data: file.data, mimeType: file.mimeType })),
      ).toMatchSnapshot();
    });
  });

  describe('result.steps', () => {
    it('should add the reasoning from the model response to the step result', async () => {
      const result = await executeFn({
        runId,
        model: modelWithReasoning,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      console.log('result.steps', JSON.stringify(result.steps, null, 2));

      expect(result.steps).toMatchSnapshot();
    });

    it('should add the sources from the model response to the step result', async () => {
      const result = await executeFn({
        runId,
        model: modelWithSources,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      expect(result.steps).toMatchSnapshot();
    });

    it('should add the files from the model response to the step result', async () => {
      const result = await executeFn({
        runId,
        model: modelWithFiles,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      console.dir({ steppies: result.steps }, { depth: null });

      expect(
        result.steps.map(step => {
          return {
            ...step,
            files: step.files.map(
              (file: any) => new DefaultGeneratedFileWithType({ data: file.data, mimeType: file.mimeType }),
            ),
          };
        }),
      ).toMatchSnapshot();
    });
  });

  describe('result.toolCalls', () => {
    it('should resolve with tool calls', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
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
          },
        },
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      expect(result.toolCalls).toStrictEqual([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
      ]);
    });
  });

  describe('result.toolResults', () => {
    it('should resolve with tool results', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
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
        prompt: 'test-input',
      });

      await result.aisdk.v4.consumeStream();

      expect(result.toolResults).toStrictEqual([
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
          result: 'value-result',
        },
      ]);
    });
  });

  describe('result.responseMessages', () => {
    it('should contain assistant response message when there are no tool calls', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
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

      await result.aisdk.v4.consumeStream();

      expect(result.response.messages).toMatchSnapshot();
    });

    it('should contain assistant response message and tool message when there are tool calls with results', async () => {
      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello, ' },
            { type: 'text-delta', textDelta: 'world!' },
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
              usage: { promptTokens: 3, completionTokens: 10 },
            },
          ]),
        }),
        tools: {
          tool1: {
            parameters: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
        },
        prompt: 'test-input',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      await result.aisdk.v4.consumeStream();

      expect(result.response.messages).toMatchSnapshot();
    });
  });
}
