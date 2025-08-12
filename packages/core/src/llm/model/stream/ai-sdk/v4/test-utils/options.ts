import { convertAsyncIterableToArray, convertReadableStreamToArray, mockId } from '@ai-sdk/provider-utils/test';
import type { StepResult, StreamTextResult, TextStreamPart } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV1, mockValues } from 'ai/test';
import { describe, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestModel, defaultSettings, modelWithFiles, modelWithSources } from './test-utils';
import type { execute } from '../../../execute';
import { convertFullStreamChunkToAISDKv4 } from '..';
import { DefaultGeneratedFileWithType } from '../file';
import { MockTracer } from '../../test-utils/mockTracer';

export function optionsTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('options.onChunk', () => {
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
            result.push(event as any);
          },
        },
      });

      await resultObject.aisdk.v4.consumeStream();
    });

    it('should return events in order', async () => {
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

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
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

      expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toStrictEqual([
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('options.maxSteps', () => {
    let result: any;
    let onFinishResult: any;
    let onStepFinishResults: any[];
    let tracer: MockTracer;

    beforeEach(() => {
      tracer = new MockTracer();
    });

    describe('2 steps: initial, tool-result', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = await executeFn({
          runId,
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              switch (responseCount++) {
                case 0: {
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
                    toolChoice: { type: 'auto' },
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
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      {
                        type: 'reasoning',
                        textDelta: 'thinking',
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
                        finishReason: 'tool-calls',
                        logprobs: undefined,
                        usage: { completionTokens: 10, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '1' } },
                  };
                }
                case 1: {
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
                    toolChoice: { type: 'auto' },
                  });

                  console.log(JSON.stringify(prompt, null, 2), 'PROMPT');

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      // providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'reasoning',
                          text: 'thinking',
                          // providerMetadata: undefined,
                          signature: undefined,
                        },
                        {
                          type: 'tool-call',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          args: { value: 'value' },
                          // providerMetadata: undefined,
                        },
                      ],
                      // providerMetadata: undefined,
                    },
                    {
                      role: 'tool',
                      content: [
                        {
                          type: 'tool-result',
                          toolCallId: 'call-1',
                          toolName: 'tool1',
                          result: 'result1',
                          // content: undefined,
                          // isError: undefined,
                          // providerMetadata: undefined,
                        },
                      ],
                      // providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-delta', textDelta: 'Hello, ' },
                      { type: 'text-delta', textDelta: `world!` },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { completionTokens: 5, promptTokens: 1 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '2' } },
                  };
                }
                default:
                  throw new Error(`Unexpected response count: ${responseCount}`);
              }
            },
          }),
          tools: {
            tool1: {
              parameters: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          prompt: 'test-input',
          options: {
            onFinish: async event => {
              expect(onFinishResult).to.be.undefined;
              onFinishResult = event as unknown as typeof onFinishResult;
            },
            onStepFinish: async event => {
              onStepFinishResults.push(event);
            },
          },
          experimental_telemetry: { isEnabled: true, tracer },
          maxSteps: 3,
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        const res = await convertAsyncIterableToArray(result.aisdk.v4.fullStream);
        expect(res).toMatchSnapshot();
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.aisdk.v4.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          console.dir({ onFinishResult }, { depth: null });
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      // describe('value promises', () => {
      //     beforeEach(async () => {
      //         await result.consumeStream();
      //     });

      //     it('result.usage should contain total token usage', async () => {
      //         assert.deepStrictEqual(await result.usage, {
      //             completionTokens: 15,
      //             promptTokens: 4,
      //             totalTokens: 19,
      //         });
      //     });

      //     it('result.finishReason should contain finish reason from final step', async () => {
      //         assert.strictEqual(await result.finishReason, 'stop');
      //     });

      //     it('result.text should contain text from final step', async () => {
      //         assert.strictEqual(await result.text, 'Hello, world!');
      //     });

      //     it('result.steps should contain all steps', async () => {
      //         expect(await result.steps).toMatchSnapshot();
      //     });

      //     it('result.response.messages should contain response messages from all steps', async () => {
      //         expect((await result.response).messages).toMatchSnapshot();
      //     });
      // });

      // it('should record telemetry data for each step', async () => {
      //     await result.consumeStream();
      //     expect(tracer.jsonSpans).toMatchSnapshot();
      // });
    });

    describe('4 steps: initial, continue, continue, continue', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = await executeFn({
          runId,
          model: new MockLanguageModelV1({
            doStream: async ({ prompt, mode }) => {
              switch (responseCount++) {
                case 0: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
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
                      // trailing text is to be discarded, trailing whitespace is to be kept:
                      { type: 'text-delta', textDelta: 'pa' },
                      { type: 'text-delta', textDelta: 'rt ' },
                      { type: 'text-delta', textDelta: '1 \n' },
                      { type: 'text-delta', textDelta: ' to-be' },
                      { type: 'text-delta', textDelta: '-discar' },
                      { type: 'text-delta', textDelta: 'ded' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 20, promptTokens: 10 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  };
                }
                case 1: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });
                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      // case where there is no leading nor trailing whitespace:
                      { type: 'text-delta', textDelta: 'no-' },
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
                      { type: 'text-delta', textDelta: 'whitespace' },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 5, promptTokens: 30 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                  };
                }
                case 2: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-2',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      {
                        type: 'source',
                        source: {
                          sourceType: 'url' as const,
                          id: '456',
                          url: 'https://example.com/2',
                          title: 'Example 2',
                          providerMetadata: { provider: { custom: 'value2' } },
                        },
                      },
                      // set up trailing whitespace for next step:
                      { type: 'text-delta', textDelta: 'immediatefollow  ' },
                      {
                        type: 'source',
                        source: {
                          sourceType: 'url' as const,
                          id: '789',
                          url: 'https://example.com/3',
                          title: 'Example 3',
                          providerMetadata: { provider: { custom: 'value3' } },
                        },
                      },
                      {
                        type: 'finish',
                        finishReason: 'length',
                        logprobs: undefined,
                        usage: { completionTokens: 2, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '3' } },
                  };
                }
                case 3: {
                  expect(mode).toStrictEqual({
                    type: 'regular',
                    toolChoice: undefined,
                    tools: undefined,
                  });

                  expect(prompt).toStrictEqual([
                    {
                      role: 'user',
                      content: [{ type: 'text', text: 'test-input' }],
                      providerMetadata: undefined,
                    },
                    {
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: 'part 1 \n ',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'no-whitespace',
                          providerMetadata: undefined,
                        },
                        {
                          type: 'text',
                          text: 'immediatefollow  ',
                          providerMetadata: undefined,
                        },
                      ],
                      providerMetadata: undefined,
                    },
                  ]);

                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-3',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      // leading whitespace is to be discarded when there is whitespace from previous step
                      // (for models such as Anthropic that trim trailing whitespace in their inputs):
                      { type: 'text-delta', textDelta: ' ' }, // split into 2 chunks for test coverage
                      { type: 'text-delta', textDelta: '  final' },
                      { type: 'text-delta', textDelta: ' va' },
                      { type: 'text-delta', textDelta: 'lue keep all w' },
                      { type: 'text-delta', textDelta: 'hitespace' },
                      { type: 'text-delta', textDelta: '\n ' },
                      { type: 'text-delta', textDelta: 'en' },
                      { type: 'text-delta', textDelta: 'd' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        logprobs: undefined,
                        usage: { completionTokens: 2, promptTokens: 3 },
                      },
                    ]),
                    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
                    rawResponse: { headers: { call: '3' } },
                  };
                }
                default:
                  throw new Error(`Unexpected response count: ${responseCount}`);
              }
            },
          }),
          prompt: 'test-input',
          experimental_continueSteps: true,
          maxSteps: 5,
          options: {
            onFinish: async event => {
              // expect(onFinishResult).to.be.undefined;
              onFinishResult = event as unknown as typeof onFinishResult;
            },
            onStepFinish: async event => {
              onStepFinishResults.push(event);
            },
          },
          experimental_telemetry: { isEnabled: true, tracer },
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
          experimental_generateMessageId: mockId({ prefix: 'msg' }),
        });
      });

      it.skip('should contain text deltas from all steps', async () => {
        expect(await convertAsyncIterableToArray(result.aisdk.v4.fullStream)).toMatchSnapshot();
      });

      describe.skip('callbacks', () => {
        beforeEach(async () => {
          await result.aisdk.v4.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchSnapshot();
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchSnapshot();
        });
      });

      describe.skip('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.usage should contain total token usage', async () => {
          expect(await result.usage).toStrictEqual({
            completionTokens: 29,
            promptTokens: 46,
            totalTokens: 75,
          });
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          expect(await result.finishReason).toStrictEqual('stop');
        });

        it('result.text should contain combined text from all steps', async () => {
          expect(await result.text).toStrictEqual(
            'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
          );
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchSnapshot();
        });

        it('result.response.messages should contain an assistant message with the combined text', async () => {
          expect((await result.response).messages).toStrictEqual([
            {
              role: 'assistant',
              id: expect.any(String),
              content: [
                {
                  type: 'text',
                  text: 'part 1 \n no-whitespaceimmediatefollow  final value keep all whitespace\n end',
                },
              ],
            },
          ]);
        });
      });

      it.skip('should record telemetry data for each step', async () => {
        await result.aisdk.v4.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it.skip('should generate correct data stream', async () => {
        const dataStream = result.aisdk.v4.toDataStream();

        expect(await convertReadableStreamToArray(dataStream)).toMatchSnapshot();
      });

      it.skip('result.sources should contain sources from all steps', async () => {
        result.aisdk.v4.consumeStream();
        expect(await result.aisdk.v4.sources).toMatchSnapshot();
      });
    });
  });

  describe('options.headers', () => {
    it('should set headers', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async ({ headers }) => {
            console.log('set_headers', headers);
            expect(headers).toStrictEqual({
              'custom-request-header': 'request-header-value',
            });

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
        headers: { 'custom-request-header': 'request-header-value' },
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual(['Hello', ', ', 'world!']);
    });
  });

  describe('options.providerMetadata', () => {
    it('should pass provider metadata to model', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async ({ providerMetadata }) => {
            expect(providerMetadata).toStrictEqual({
              aProvider: { someKey: 'someValue' },
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'provider metadata test' },
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
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual(['provider metadata test']);
    });
  });

  // describe('options.abortSignal', () => {
  //     it('should forward abort signal to tool execution during streaming', async () => {
  //         const abortController = new AbortController();
  //         const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

  //         const result = streamText({
  //             model: createTestModel({
  //                 stream: convertArrayToReadableStream([
  //                     {
  //                         type: 'tool-call',
  //                         toolCallType: 'function',
  //                         toolCallId: 'call-1',
  //                         toolName: 'tool1',
  //                         args: `{ "value": "value" }`,
  //                     },
  //                     {
  //                         type: 'finish',
  //                         finishReason: 'stop',
  //                         usage: { promptTokens: 10, completionTokens: 20 },
  //                     },
  //                 ]),
  //             }),
  //             tools: {
  //                 tool1: {
  //                     parameters: z.object({ value: z.string() }),
  //                     execute: toolExecuteMock,
  //                 },
  //             },
  //             prompt: 'test-input',
  //             abortSignal: abortController.signal,
  //         });

  //         await convertAsyncIterableToArray(result.fullStream);

  //         abortController.abort();

  //         expect(toolExecuteMock).toHaveBeenCalledWith(
  //             { value: 'value' },
  //             {
  //                 abortSignal: abortController.signal,
  //                 toolCallId: 'call-1',
  //                 messages: expect.any(Array),
  //             },
  //         );
  //     });
  // });

  describe('options.messages', () => {
    it('should detect and convert ui messages', async () => {
      const result = executeFn({
        runId,
        model: new MockLanguageModelV1({
          doStream: async ({ prompt }) => {
            console.log('prompt_in', JSON.stringify(prompt, null, 2));
            expect(prompt).toStrictEqual([
              {
                content: [
                  {
                    text: 'prompt',
                    type: 'text',
                  },
                ],
                providerMetadata: undefined,
                role: 'user',
              },
              {
                content: [
                  {
                    args: {
                      value: 'test-value',
                    },
                    providerMetadata: undefined,
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-call',
                  },
                ],
                providerMetadata: undefined,
                role: 'assistant',
              },
              {
                content: [
                  {
                    content: undefined,
                    isError: undefined,
                    providerMetadata: undefined,
                    result: 'test result',
                    toolCallId: 'call-1',
                    toolName: 'test-tool',
                    type: 'tool-result',
                  },
                ],
                providerMetadata: undefined,
                role: 'tool',
              },
            ]);

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
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
        messages: [
          {
            role: 'user',
            content: 'prompt',
          },
          {
            role: 'assistant',
            content: '',
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'call-1',
                toolName: 'test-tool',
                args: { value: 'test-value' },
                result: 'test result',
              },
            ],
          },
        ],
      });

      expect(await convertAsyncIterableToArray(result.textStream)).toStrictEqual(['Hello']);
    });

    it.skip('should support models that use "this" context in supportsUrl', async () => {
      let supportsUrlCalled = false;
      class MockLanguageModelWithImageSupport extends MockLanguageModelV1 {
        readonly supportsImageUrls = false;

        constructor() {
          super({
            supportsUrl(url: URL) {
              supportsUrlCalled = true;
              // Reference 'this' to verify context
              return this.modelId === 'mock-model-id';
            },
            doStream: async () => ({
              stream: convertArrayToReadableStream([
                { type: 'text-delta', textDelta: 'Hello' },
                { type: 'text-delta', textDelta: ', ' },
                { type: 'text-delta', textDelta: 'world!' },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            }),
          });
        }
      }

      const model = new MockLanguageModelWithImageSupport();
      const result = executeFn({
        runId,
        model,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: 'https://example.com/test.jpg' }],
          },
        ],
      });

      await result.aisdk.v4.consumeStream();

      expect(supportsUrlCalled).toBe(true);
      expect(await result.text).toBe('Hello, world!');
    });
  });
}
