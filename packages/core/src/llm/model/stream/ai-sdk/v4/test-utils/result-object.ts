import { convertArrayToReadableStream, mockId } from 'ai/test';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import type { execute } from '../../../execute';
import { createTestModel, defaultSettings, modelWithFiles, modelWithReasoning, modelWithSources } from './test-utils';

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

      // console.log('result.warnings', result.warnings);

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

      // console.log('result.response.messages', JSON.stringify(result.response.messages, null, 2));

      expect(result.aisdk.v4.response.messages).toMatchSnapshot();
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

      // console.log('result.response', JSON.stringify(result.response, null, 2));

      expect(result.aisdk.v4.response).toMatchSnapshot();
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

      expect(result.reasoning).toMatchSnapshot();
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

      expect(result.aisdk.v4.sources).toMatchSnapshot();
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

      expect(result.aisdk.v4.files).toMatchSnapshot();
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

      console.log('result.steps', JSON.stringify(result.aisdk.v4.steps, null, 2));

      expect(result.aisdk.v4.steps).toMatchSnapshot();
    });

    it('should add the sources from the model response to the step result', async () => {
      const result = await executeFn({
        runId,
        model: modelWithSources,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      expect(result.aisdk.v4.steps).toMatchSnapshot();
    });

    it('should add the files from the model response to the step result', async () => {
      const result = await executeFn({
        runId,
        model: modelWithFiles,
        ...defaultSettings(),
      });

      await result.aisdk.v4.consumeStream();

      console.dir({ steppies: result.aisdk.v4.steps }, { depth: null });

      expect(result.aisdk.v4.steps).toMatchSnapshot();
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

      expect(result.aisdk.v4.toolCalls).toStrictEqual([
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

      expect(result.aisdk.v4.toolResults).toStrictEqual([
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

      expect(result.aisdk.v4.response.messages).toMatchSnapshot();
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

      expect(result.aisdk.v4.response.messages).toMatchSnapshot();
    });
  });

  // describe('text output', () => {
  //   it('should send partial output stream', async () => {
  //     const result = streamText({
  //       model: createTestModel({
  //         stream: convertArrayToReadableStream([
  //           { type: 'text-delta', textDelta: 'Hello, ' },
  //           { type: 'text-delta', textDelta: ',' },
  //           { type: 'text-delta', textDelta: ' world!' },
  //           {
  //             type: 'finish',
  //             finishReason: 'stop',
  //             usage: { completionTokens: 10, promptTokens: 3 },
  //           },
  //         ]),
  //       }),
  //       experimental_output: text(),
  //       prompt: 'prompt',
  //     });

  //     expect(await convertAsyncIterableToArray(result.experimental_partialOutputStream)).toStrictEqual([
  //       'Hello, ',
  //       'Hello, ,',
  //       'Hello, , world!',
  //     ]);
  //   });
  // });

  // describe('object output', () => {
  //   it('should set responseFormat to json and send schema as part of the responseFormat', async () => {
  //     let callOptions!: LanguageModelV1CallOptions;

  //     const result = streamText({
  //       model: new MockLanguageModelV1({
  //         supportsStructuredOutputs: false,
  //         doStream: async args => {
  //           callOptions = args;
  //           return {
  //             stream: convertArrayToReadableStream([
  //               { type: 'text-delta', textDelta: '{ ' },
  //               { type: 'text-delta', textDelta: '"value": ' },
  //               { type: 'text-delta', textDelta: `"Hello, ` },
  //               { type: 'text-delta', textDelta: `world` },
  //               { type: 'text-delta', textDelta: `!"` },
  //               { type: 'text-delta', textDelta: ' }' },
  //               {
  //                 type: 'finish',
  //                 finishReason: 'stop',
  //                 usage: { completionTokens: 10, promptTokens: 3 },
  //               },
  //             ]),
  //             rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  //           };
  //         },
  //       }),
  //       experimental_output: object({
  //         schema: z.object({ value: z.string() }),
  //       }),
  //       prompt: 'prompt',
  //     });

  //     await result.consumeStream();

  //     expect(callOptions).toEqual({
  //       temperature: 0,
  //       mode: { type: 'regular' },
  //       inputFormat: 'prompt',
  //       responseFormat: { type: 'json', schema: undefined },
  //       prompt: [
  //         {
  //           content:
  //             'JSON schema:\n' +
  //             '{"type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
  //             'You MUST answer with a JSON object that matches the JSON schema above.',
  //           role: 'system',
  //         },
  //         {
  //           content: [{ text: 'prompt', type: 'text' }],
  //           providerMetadata: undefined,
  //           role: 'user',
  //         },
  //       ],
  //     });
  //   });

  //   it('should send valid partial text fragments', async () => {
  //     const result = streamText({
  //       model: createTestModel({
  //         stream: convertArrayToReadableStream([
  //           { type: 'text-delta', textDelta: '{ ' },
  //           { type: 'text-delta', textDelta: '"value": ' },
  //           { type: 'text-delta', textDelta: `"Hello, ` },
  //           { type: 'text-delta', textDelta: `world` },
  //           { type: 'text-delta', textDelta: `!"` },
  //           { type: 'text-delta', textDelta: ' }' },
  //           {
  //             type: 'finish',
  //             finishReason: 'stop',
  //             usage: { completionTokens: 10, promptTokens: 3 },
  //           },
  //         ]),
  //       }),
  //       experimental_output: object({
  //         schema: z.object({ value: z.string() }),
  //       }),
  //       prompt: 'prompt',
  //     });

  //     expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual([
  //       `{ `,
  //       // key difference: need to combine after `:`
  //       `"value": "Hello, `,
  //       `world`,
  //       `!"`,
  //       ` }`,
  //     ]);
  //   });

  //   it('should send partial output stream', async () => {
  //     const result = streamText({
  //       model: createTestModel({
  //         stream: convertArrayToReadableStream([
  //           { type: 'text-delta', textDelta: '{ ' },
  //           { type: 'text-delta', textDelta: '"value": ' },
  //           { type: 'text-delta', textDelta: `"Hello, ` },
  //           { type: 'text-delta', textDelta: `world` },
  //           { type: 'text-delta', textDelta: `!"` },
  //           { type: 'text-delta', textDelta: ' }' },
  //           {
  //             type: 'finish',
  //             finishReason: 'stop',
  //             usage: { completionTokens: 10, promptTokens: 3 },
  //           },
  //         ]),
  //       }),
  //       experimental_output: object({
  //         schema: z.object({ value: z.string() }),
  //       }),
  //       prompt: 'prompt',
  //     });

  //     expect(await convertAsyncIterableToArray(result.experimental_partialOutputStream)).toStrictEqual([
  //       {},
  //       { value: 'Hello, ' },
  //       { value: 'Hello, world' },
  //       { value: 'Hello, world!' },
  //     ]);
  //   });

  //   it('should send partial output stream when last chunk contains content', async () => {
  //     const result = streamText({
  //       model: createTestModel({
  //         stream: convertArrayToReadableStream([
  //           { type: 'text-delta', textDelta: '{ ' },
  //           { type: 'text-delta', textDelta: '"value": ' },
  //           { type: 'text-delta', textDelta: `"Hello, ` },
  //           { type: 'text-delta', textDelta: `world!" }` },
  //           {
  //             type: 'finish',
  //             finishReason: 'stop',
  //             usage: { completionTokens: 10, promptTokens: 3 },
  //           },
  //         ]),
  //       }),
  //       experimental_output: object({
  //         schema: z.object({ value: z.string() }),
  //       }),
  //       prompt: 'prompt',
  //     });

  //     expect(await convertAsyncIterableToArray(result.experimental_partialOutputStream)).toStrictEqual([
  //       {},
  //       { value: 'Hello, ' },
  //       { value: 'Hello, world!' },
  //     ]);
  //   });

  //   it('should resolve text promise with the correct content', async () => {
  //     const result = streamText({
  //       model: createTestModel({
  //         stream: convertArrayToReadableStream([
  //           { type: 'text-delta', textDelta: '{ ' },
  //           { type: 'text-delta', textDelta: '"value": ' },
  //           { type: 'text-delta', textDelta: `"Hello, ` },
  //           { type: 'text-delta', textDelta: `world!" ` },
  //           { type: 'text-delta', textDelta: '}' },
  //           {
  //             type: 'finish',
  //             finishReason: 'stop',
  //             usage: { completionTokens: 10, promptTokens: 3 },
  //           },
  //         ]),
  //       }),
  //       experimental_output: object({
  //         schema: z.object({ value: z.string() }),
  //       }),
  //       prompt: 'prompt',
  //     });

  //     result.consumeStream();

  //     expect(await result.text).toStrictEqual('{ "value": "Hello, world!" }');
  //   });

  //   it('should call onFinish with the correct content', async () => {
  //     let result!: Parameters<Required<Parameters<typeof streamText>[0]>['onFinish']>[0];

  //     const resultObject = streamText({
  //       model: createTestModel({
  //         stream: convertArrayToReadableStream([
  //           { type: 'text-delta', textDelta: '{ ' },
  //           { type: 'text-delta', textDelta: '"value": ' },
  //           { type: 'text-delta', textDelta: `"Hello, ` },
  //           { type: 'text-delta', textDelta: `world!" ` },
  //           { type: 'text-delta', textDelta: '}' },
  //           {
  //             type: 'finish',
  //             finishReason: 'stop',
  //             usage: { completionTokens: 10, promptTokens: 3 },
  //           },
  //         ]),
  //       }),
  //       experimental_output: object({
  //         schema: z.object({ value: z.string() }),
  //       }),
  //       prompt: 'prompt',
  //       onFinish: async event => {
  //         result = event as unknown as typeof result;
  //       },
  //       experimental_generateMessageId: mockId({ prefix: 'msg' }),
  //       _internal: {
  //         generateId: mockId({ prefix: 'id' }),
  //         currentDate: () => new Date(0),
  //       },
  //     });

  //     resultObject.consumeStream();

  //     await resultObject.consumeStream();

  //     expect(result).toMatchSnapshot();
  //   });
  // });
}
