import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import type { LanguageModelV2FunctionTool, LanguageModelV2ProviderDefinedTool } from '@ai-sdk/provider-v5';
import { convertArrayToReadableStream, mockId, MockLanguageModelV2, mockValues } from 'ai-v5/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import type { execute } from '../../../execute';
import {
  createTestModel,
  testUsage,
  defaultSettings,
  modelWithSources,
  modelWithFiles,
  testUsage2,
} from './test-utils';
import { stepCountIs, type TextStreamPart } from 'ai-v5';
import { MockTracer } from '../../test-utils/mockTracer';

export function optionsTests({ executeFn, runId }: { executeFn: typeof execute; runId: string }) {
  describe('options.abortSignal', () => {
    it('should forward abort signal to tool execution during streaming', async () => {
      const abortController = new AbortController();
      const toolExecuteMock = vi.fn().mockResolvedValue('tool result');

      const result = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
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
            execute: toolExecuteMock,
          },
        },
        prompt: 'test-input',
        options: {
          abortSignal: abortController.signal,
        },
      });

      await convertAsyncIterableToArray(result.aisdk.v5.fullStream as any);

      abortController.abort();

      expect(toolExecuteMock).toHaveBeenCalledWith(
        { value: 'value' },
        {
          abortSignal: abortController.signal,
          toolCallId: 'call-1',
          messages: expect.any(Array),
        },
      );
    });
  });

  describe('options.onError', () => {
    it('should invoke onError', async () => {
      const result: Array<{ error: unknown }> = [];

      const resultObject = await executeFn({
        runId,
        model: new MockLanguageModelV2({
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

      await resultObject.aisdk.v5.consumeStream();

      expect(result).toStrictEqual([{ error: new Error('test error') }]);
    });
  });

  describe('options.providerMetadata', () => {
    it('should pass provider metadata to model', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV2({
          doStream: async ({ providerOptions }) => {
            expect(providerOptions).toStrictEqual({
              aProvider: { someKey: 'someValue' },
            });

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                {
                  type: 'text-delta',
                  id: '1',
                  delta: 'provider metadata test',
                },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        prompt: 'test-input',
        providerMetadata: {
          aProvider: { someKey: 'someValue' },
        },
      });

      expect(await convertAsyncIterableToArray(result.textStream as any)).toEqual(['provider metadata test']);
    });
  });

  describe('options.activeTools', () => {
    it('should filter available tools to only the ones in activeTools', async () => {
      let tools: (LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool)[] | undefined;

      const result = await executeFn({
        runId,
        model: new MockLanguageModelV2({
          doStream: async ({ tools: toolsArg }) => {
            tools = toolsArg;

            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Hello' },
                { type: 'text-delta', id: '1', delta: ', ' },
                { type: 'text-delta', id: '1', delta: `world!` },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: testUsage,
                },
              ]),
            };
          },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result1',
          },
          tool2: {
            inputSchema: z.object({ value: z.string() }),
            execute: async () => 'result2',
          },
        },
        prompt: 'test-input',
        options: {
          activeTools: ['tool1'],
        },
      });

      await result.aisdk.v5.consumeStream();

      expect(tools).toMatchInlineSnapshot(`
            [
              {
                "description": undefined,
                "inputSchema": {
                  "$schema": "http://json-schema.org/draft-07/schema#",
                  "additionalProperties": false,
                  "properties": {
                    "value": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "value",
                  ],
                  "type": "object",
                },
                "name": "tool1",
                "providerOptions": undefined,
                "type": "function",
              },
            ]
          `);
    });
  });

  describe.skip('options.stopWhen', () => {
    let result: any;
    let onFinishResult: any;
    let onStepFinishResults: any[];
    let tracer: any;
    let stepInputs: Array<any>;

    beforeEach(() => {
      tracer = new MockTracer();
      stepInputs = [];
    });

    describe('2 steps: initial, tool-result', () => {
      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = await executeFn({
          runId,
          model: new MockLanguageModelV2({
            doStream: async ({ prompt, tools, toolChoice }) => {
              stepInputs.push({ prompt, tools, toolChoice });

              switch (responseCount++) {
                case 0: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      { type: 'reasoning-start', id: '0' },
                      { type: 'reasoning-delta', id: '0', delta: 'thinking' },
                      { type: 'reasoning-end', id: '0' },
                      {
                        type: 'tool-call',
                        id: 'call-1',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-start', id: '1' },
                      { type: 'text-delta', id: '1', delta: 'Hello, ' },
                      { type: 'text-delta', id: '1', delta: `world!` },
                      { type: 'text-end', id: '1' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        usage: testUsage2,
                      },
                    ]),
                    response: { headers: { call: '2' } },
                  };
                }
                default:
                  throw new Error(`Unexpected response count: ${responseCount}`);
              }
            },
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
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
          stopWhen: stepCountIs(3),
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
            generateId: mockId({ prefix: 'id' }),
          },
        });
      });

      it('should contain correct step inputs', async () => {
        await result.aisdk.v5.consumeStream();

        expect(stepInputs).toMatchInlineSnapshot(`
          [
            {
              "prompt": [
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
              ],
              "toolChoice": {
                "type": "auto",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
            },
            {
              "prompt": [
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "providerOptions": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "toolChoice": {
                "type": "auto",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
            },
          ]
        `);
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream)).toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "0",
                "type": "reasoning-start",
              },
              {
                "id": "0",
                "providerMetadata": undefined,
                "text": "thinking",
                "type": "reasoning-delta",
              },
              {
                "id": "0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "value",
                },
                "output": "result1",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello, ",
                "type": "text-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "world!",
                "type": "text-delta",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 6,
                  "outputTokens": 20,
                  "reasoningTokens": 10,
                  "totalTokens": 36,
                },
                "type": "finish",
              },
            ]
          `);
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchInlineSnapshot(`
            {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "dynamicToolCalls": [],
              "dynamicToolResults": [],
              "files": [],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "reasoning": [],
              "reasoningText": undefined,
              "request": {},
              "response": {
                "headers": {
                  "call": "2",
                },
                "id": "id-1",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "thinking",
                        "type": "reasoning",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-call",
                      },
                    ],
                    "role": "assistant",
                  },
                  {
                    "content": [
                      {
                        "output": {
                          "type": "text",
                          "value": "result1",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:01.000Z,
              },
              "sources": [],
              "staticToolCalls": [],
              "staticToolResults": [],
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
              "text": "Hello, world!",
              "toolCalls": [],
              "toolResults": [],
              "totalUsage": {
                "cachedInputTokens": 3,
                "inputTokens": 6,
                "outputTokens": 20,
                "reasoningTokens": 10,
                "totalTokens": 36,
              },
              "usage": {
                "cachedInputTokens": 3,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": 10,
                "totalTokens": 23,
              },
              "warnings": [],
            }
          `);
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "output": "result1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.totalUsage should contain total token usage', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
            {
              "cachedInputTokens": 3,
              "inputTokens": 6,
              "outputTokens": 20,
              "reasoningTokens": 10,
              "totalTokens": 36,
            }
          `);
        });

        it('result.usage should contain token usage from final step', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 3,
            "inputTokens": 6,
            "outputTokens": 20,
            "reasoningTokens": 10,
            "totalTokens": 36,
          }
        `);
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain text from final step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "output": "result1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "result1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "text",
                      "value": "result1",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ]
          `);
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchSnapshot();
      });

      it('should have correct ui message stream', async () => {
        expect(await convertReadableStreamToArray(result.toUIMessageStream())).toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "type": "start-step",
              },
              {
                "id": "0",
                "type": "reasoning-start",
              },
              {
                "delta": "thinking",
                "id": "0",
                "type": "reasoning-delta",
              },
              {
                "id": "0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-input-available",
              },
              {
                "output": "result1",
                "toolCallId": "call-1",
                "type": "tool-output-available",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "start-step",
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "delta": "Hello, ",
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

    describe('2 steps: initial, tool-result with prepareStep', () => {
      let result: StreamTextResult<any, any>;
      let doStreamCalls: Array<LanguageModelV2CallOptions>;
      let prepareStepCalls: Array<{
        stepNumber: number;
        steps: Array<StepResult<any>>;
        messages: Array<ModelMessage>;
      }>;

      beforeEach(async () => {
        doStreamCalls = [];
        prepareStepCalls = [];

        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async options => {
              doStreamCalls.push(options);
              switch (doStreamCalls.length) {
                case 1:
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
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                case 2:
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-start', id: '2' },
                      { type: 'text-delta', id: '2', delta: 'Hello, ' },
                      { type: 'text-delta', id: '2', delta: `world!` },
                      { type: 'text-end', id: '2' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        usage: testUsage2,
                      },
                    ]),
                    response: { headers: { call: '2' } },
                  };
                default:
                  throw new Error(`Unexpected response count: ${doStreamCalls.length}`);
              }
            },
          }),
          tools: {
            tool1: tool({
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            }),
          },
          prompt: 'test-input',
          stopWhen: stepCountIs(3),
          prepareStep: async ({ model, stepNumber, steps, messages }) => {
            prepareStepCalls.push({ stepNumber, steps, messages });

            if (stepNumber === 0) {
              return {
                toolChoice: {
                  type: 'tool',
                  toolName: 'tool1' as const,
                },
                system: 'system-message-0',
                messages: [
                  {
                    role: 'user',
                    content: 'new input from prepareStep',
                  },
                ],
              };
            }

            if (stepNumber === 1) {
              return {
                activeTools: [],
                system: 'system-message-1',
              };
            }
          },
        });
      });

      it('should contain all doStream calls', async () => {
        await result.consumeStream();
        expect(doStreamCalls).toMatchInlineSnapshot(`
          [
            {
              "abortSignal": undefined,
              "frequencyPenalty": undefined,
              "headers": undefined,
              "includeRawChunks": false,
              "maxOutputTokens": undefined,
              "presencePenalty": undefined,
              "prompt": [
                {
                  "content": "system-message-0",
                  "role": "system",
                },
                {
                  "content": [
                    {
                      "text": "new input from prepareStep",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
              ],
              "providerOptions": undefined,
              "responseFormat": undefined,
              "seed": undefined,
              "stopSequences": undefined,
              "temperature": undefined,
              "toolChoice": {
                "toolName": "tool1",
                "type": "tool",
              },
              "tools": [
                {
                  "description": undefined,
                  "inputSchema": {
                    "$schema": "http://json-schema.org/draft-07/schema#",
                    "additionalProperties": false,
                    "properties": {
                      "value": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "value",
                    ],
                    "type": "object",
                  },
                  "name": "tool1",
                  "providerOptions": undefined,
                  "type": "function",
                },
              ],
              "topK": undefined,
              "topP": undefined,
            },
            {
              "abortSignal": undefined,
              "frequencyPenalty": undefined,
              "headers": undefined,
              "includeRawChunks": false,
              "maxOutputTokens": undefined,
              "presencePenalty": undefined,
              "prompt": [
                {
                  "content": "system-message-1",
                  "role": "system",
                },
                {
                  "content": [
                    {
                      "text": "test-input",
                      "type": "text",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "providerOptions": undefined,
                  "role": "tool",
                },
              ],
              "providerOptions": undefined,
              "responseFormat": undefined,
              "seed": undefined,
              "stopSequences": undefined,
              "temperature": undefined,
              "toolChoice": {
                "type": "auto",
              },
              "tools": [],
              "topK": undefined,
              "topP": undefined,
            },
          ]
        `);
      });

      it('should contain all prepareStep calls', async () => {
        await result.consumeStream();
        expect(prepareStepCalls).toMatchInlineSnapshot(`
          [
            {
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
              ],
              "stepNumber": 0,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "messages": [
                {
                  "content": "test-input",
                  "role": "user",
                },
                {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerOptions": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                  ],
                  "role": "assistant",
                },
                {
                  "content": [
                    {
                      "output": {
                        "type": "text",
                        "value": "result1",
                      },
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "role": "tool",
                },
              ],
              "stepNumber": 1,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
      });
    });

    describe('2 steps: initial, tool-result with transformed tool results', () => {
      const upperCaseToolResultTransform = () =>
        new TransformStream<
          TextStreamPart<{ tool1: Tool<{ value: string }, string> }>,
          TextStreamPart<{ tool1: Tool<{ value: string }, string> }>
        >({
          transform(chunk, controller) {
            if (chunk.type === 'tool-result' && !chunk.dynamic) {
              chunk.output = chunk.output.toUpperCase();
              chunk.input = {
                ...chunk.input,
                value: chunk.input.value.toUpperCase(),
              };
            }

            controller.enqueue(chunk);
          },
        });

      beforeEach(async () => {
        result = undefined as any;
        onFinishResult = undefined as any;
        onStepFinishResults = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async ({ prompt, tools, toolChoice }) => {
              switch (responseCount++) {
                case 0: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      { type: 'reasoning-start', id: 'id-0' },
                      {
                        type: 'reasoning-delta',
                        id: 'id-0',
                        delta: 'thinking',
                      },
                      { type: 'reasoning-end', id: 'id-0' },
                      {
                        type: 'tool-call',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                }
                case 1: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-1',
                        modelId: 'mock-model-id',
                        timestamp: new Date(1000),
                      },
                      { type: 'text-start', id: '1' },
                      { type: 'text-delta', id: '1', delta: 'Hello, ' },
                      { type: 'text-delta', id: '1', delta: `world!` },
                      { type: 'text-end', id: '1' },
                      {
                        type: 'finish',
                        finishReason: 'stop',
                        usage: testUsage2,
                      },
                    ]),
                    response: { headers: { call: '2' } },
                  };
                }
                default:
                  throw new Error(`Unexpected response count: ${responseCount}`);
              }
            },
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          experimental_transform: upperCaseToolResultTransform,
          prompt: 'test-input',
          onFinish: async event => {
            expect(onFinishResult).to.be.undefined;
            onFinishResult = event as unknown as typeof onFinishResult;
          },
          onStepFinish: async event => {
            onStepFinishResults.push(event);
          },
          experimental_telemetry: { isEnabled: true, tracer },
          stopWhen: stepCountIs(3),
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
            generateId: mockId({ prefix: 'id' }),
          },
        });
      });

      it('should contain assistant response message and tool message from all steps', async () => {
        expect(await convertAsyncIterableToArray(result.fullStream)).toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "id-0",
                "type": "reasoning-start",
              },
              {
                "id": "id-0",
                "providerMetadata": undefined,
                "text": "thinking",
                "type": "reasoning-delta",
              },
              {
                "id": "id-0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-call",
              },
              {
                "input": {
                  "value": "VALUE",
                },
                "output": "RESULT1",
                "providerExecuted": undefined,
                "providerMetadata": undefined,
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-result",
              },
              {
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
              },
              {
                "request": {},
                "type": "start-step",
                "warnings": [],
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "Hello, ",
                "type": "text-delta",
              },
              {
                "id": "1",
                "providerMetadata": undefined,
                "text": "world!",
                "type": "text-delta",
              },
              {
                "id": "1",
                "type": "text-end",
              },
              {
                "finishReason": "stop",
                "providerMetadata": undefined,
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "type": "finish-step",
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
              },
              {
                "finishReason": "stop",
                "totalUsage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 6,
                  "outputTokens": 20,
                  "reasoningTokens": 10,
                  "totalTokens": 36,
                },
                "type": "finish",
              },
            ]
          `);
      });

      describe('callbacks', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('onFinish should send correct information', async () => {
          expect(onFinishResult).toMatchInlineSnapshot(`
            {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "dynamicToolCalls": [],
              "dynamicToolResults": [],
              "files": [],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "reasoning": [],
              "reasoningText": undefined,
              "request": {},
              "response": {
                "headers": {
                  "call": "2",
                },
                "id": "id-1",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "thinking",
                        "type": "reasoning",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-call",
                      },
                    ],
                    "role": "assistant",
                  },
                  {
                    "content": [
                      {
                        "output": {
                          "type": "text",
                          "value": "RESULT1",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:01.000Z,
              },
              "sources": [],
              "staticToolCalls": [],
              "staticToolResults": [],
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "VALUE",
                      },
                      "output": "RESULT1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "RESULT1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "Hello, world!",
                      "type": "text",
                    },
                  ],
                  "finishReason": "stop",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "2",
                    },
                    "id": "id-1",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "RESULT1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "Hello, world!",
                            "type": "text",
                          },
                        ],
                        "role": "assistant",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:01.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": 3,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": 10,
                    "totalTokens": 23,
                  },
                  "warnings": [],
                },
              ],
              "text": "Hello, world!",
              "toolCalls": [],
              "toolResults": [],
              "totalUsage": {
                "cachedInputTokens": 3,
                "inputTokens": 6,
                "outputTokens": 20,
                "reasoningTokens": 10,
                "totalTokens": 36,
              },
              "usage": {
                "cachedInputTokens": 3,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": 10,
                "totalTokens": 23,
              },
              "warnings": [],
            }
          `);
        });

        it('onStepFinish should send correct information', async () => {
          expect(onStepFinishResults).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "VALUE",
                    },
                    "output": "RESULT1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });
      });

      describe('value promises', () => {
        beforeEach(async () => {
          await result.consumeStream();
        });

        it('result.totalUsage should contain total token usage', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
            {
              "cachedInputTokens": 3,
              "inputTokens": 6,
              "outputTokens": 20,
              "reasoningTokens": 10,
              "totalTokens": 36,
            }
          `);
        });

        it('result.usage should contain token usage from final step', async () => {
          expect(await result.totalUsage).toMatchInlineSnapshot(`
          {
            "cachedInputTokens": 3,
            "inputTokens": 6,
            "outputTokens": 20,
            "reasoningTokens": 10,
            "totalTokens": 36,
          }
        `);
        });

        it('result.finishReason should contain finish reason from final step', async () => {
          assert.strictEqual(await result.finishReason, 'stop');
        });

        it('result.text should contain text from final step', async () => {
          assert.strictEqual(await result.text, 'Hello, world!');
        });

        it('result.steps should contain all steps', async () => {
          expect(await result.steps).toMatchInlineSnapshot(`
            [
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                  {
                    "input": {
                      "value": "VALUE",
                    },
                    "output": "RESULT1",
                    "providerExecuted": undefined,
                    "providerMetadata": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "finishReason": "tool-calls",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "1",
                  },
                  "id": "id-0",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:00.000Z,
                },
                "usage": {
                  "cachedInputTokens": undefined,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": undefined,
                  "totalTokens": 13,
                },
                "warnings": [],
              },
              DefaultStepResult {
                "content": [
                  {
                    "providerMetadata": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "finishReason": "stop",
                "providerMetadata": undefined,
                "request": {},
                "response": {
                  "headers": {
                    "call": "2",
                  },
                  "id": "id-1",
                  "messages": [
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "thinking",
                          "type": "reasoning",
                        },
                        {
                          "input": {
                            "value": "value",
                          },
                          "providerExecuted": undefined,
                          "providerOptions": undefined,
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-call",
                        },
                      ],
                      "role": "assistant",
                    },
                    {
                      "content": [
                        {
                          "output": {
                            "type": "text",
                            "value": "RESULT1",
                          },
                          "toolCallId": "call-1",
                          "toolName": "tool1",
                          "type": "tool-result",
                        },
                      ],
                      "role": "tool",
                    },
                    {
                      "content": [
                        {
                          "providerOptions": undefined,
                          "text": "Hello, world!",
                          "type": "text",
                        },
                      ],
                      "role": "assistant",
                    },
                  ],
                  "modelId": "mock-model-id",
                  "timestamp": 1970-01-01T00:00:01.000Z,
                },
                "usage": {
                  "cachedInputTokens": 3,
                  "inputTokens": 3,
                  "outputTokens": 10,
                  "reasoningTokens": 10,
                  "totalTokens": 23,
                },
                "warnings": [],
              },
            ]
          `);
        });

        it('result.response.messages should contain response messages from all steps', async () => {
          expect((await result.response).messages).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "thinking",
                    "type": "reasoning",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "text",
                      "value": "RESULT1",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ]
          `);
        });
      });

      it('should record telemetry data for each step', async () => {
        await result.consumeStream();
        expect(tracer.jsonSpans).toMatchInlineSnapshot(`
          [
            {
              "attributes": {
                "ai.model.id": "mock-model-id",
                "ai.model.provider": "mock-provider",
                "ai.operationId": "ai.streamText",
                "ai.prompt": "{"prompt":"test-input"}",
                "ai.response.finishReason": "stop",
                "ai.response.text": "Hello, world!",
                "ai.settings.maxRetries": 2,
                "ai.usage.cachedInputTokens": 3,
                "ai.usage.inputTokens": 6,
                "ai.usage.outputTokens": 20,
                "ai.usage.reasoningTokens": 10,
                "ai.usage.totalTokens": 36,
                "operation.name": "ai.streamText",
              },
              "events": [],
              "name": "ai.streamText",
            },
            {
              "attributes": {
                "ai.model.id": "mock-model-id",
                "ai.model.provider": "mock-provider",
                "ai.operationId": "ai.streamText.doStream",
                "ai.prompt.messages": "[{"role":"user","content":[{"type":"text","text":"test-input"}]}]",
                "ai.prompt.toolChoice": "{"type":"auto"}",
                "ai.prompt.tools": [
                  "{"type":"function","name":"tool1","inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}}",
                ],
                "ai.response.avgOutputTokensPerSecond": 20,
                "ai.response.finishReason": "tool-calls",
                "ai.response.id": "id-0",
                "ai.response.model": "mock-model-id",
                "ai.response.msToFinish": 500,
                "ai.response.msToFirstChunk": 100,
                "ai.response.text": "",
                "ai.response.timestamp": "1970-01-01T00:00:00.000Z",
                "ai.response.toolCalls": "[{"type":"tool-call","toolCallId":"call-1","toolName":"tool1","input":{"value":"value"}}]",
                "ai.settings.maxRetries": 2,
                "ai.usage.inputTokens": 3,
                "ai.usage.outputTokens": 10,
                "ai.usage.totalTokens": 13,
                "gen_ai.request.model": "mock-model-id",
                "gen_ai.response.finish_reasons": [
                  "tool-calls",
                ],
                "gen_ai.response.id": "id-0",
                "gen_ai.response.model": "mock-model-id",
                "gen_ai.system": "mock-provider",
                "gen_ai.usage.input_tokens": 3,
                "gen_ai.usage.output_tokens": 10,
                "operation.name": "ai.streamText.doStream",
              },
              "events": [
                {
                  "attributes": {
                    "ai.response.msToFirstChunk": 100,
                  },
                  "name": "ai.stream.firstChunk",
                },
                {
                  "attributes": undefined,
                  "name": "ai.stream.finish",
                },
              ],
              "name": "ai.streamText.doStream",
            },
            {
              "attributes": {
                "ai.operationId": "ai.toolCall",
                "ai.toolCall.args": "{"value":"value"}",
                "ai.toolCall.id": "call-1",
                "ai.toolCall.name": "tool1",
                "ai.toolCall.result": ""result1"",
                "operation.name": "ai.toolCall",
              },
              "events": [],
              "name": "ai.toolCall",
            },
            {
              "attributes": {
                "ai.model.id": "mock-model-id",
                "ai.model.provider": "mock-provider",
                "ai.operationId": "ai.streamText.doStream",
                "ai.prompt.messages": "[{"role":"user","content":[{"type":"text","text":"test-input"}]},{"role":"assistant","content":[{"type":"reasoning","text":"thinking"},{"type":"tool-call","toolCallId":"call-1","toolName":"tool1","input":{"value":"value"}}]},{"role":"tool","content":[{"type":"tool-result","toolCallId":"call-1","toolName":"tool1","output":{"type":"text","value":"RESULT1"}}]}]",
                "ai.prompt.toolChoice": "{"type":"auto"}",
                "ai.prompt.tools": [
                  "{"type":"function","name":"tool1","inputSchema":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"value":{"type":"string"}},"required":["value"],"additionalProperties":false}}",
                ],
                "ai.response.avgOutputTokensPerSecond": 25,
                "ai.response.finishReason": "stop",
                "ai.response.id": "id-1",
                "ai.response.model": "mock-model-id",
                "ai.response.msToFinish": 400,
                "ai.response.msToFirstChunk": 400,
                "ai.response.text": "Hello, world!",
                "ai.response.timestamp": "1970-01-01T00:00:01.000Z",
                "ai.settings.maxRetries": 2,
                "ai.usage.cachedInputTokens": 3,
                "ai.usage.inputTokens": 3,
                "ai.usage.outputTokens": 10,
                "ai.usage.reasoningTokens": 10,
                "ai.usage.totalTokens": 23,
                "gen_ai.request.model": "mock-model-id",
                "gen_ai.response.finish_reasons": [
                  "stop",
                ],
                "gen_ai.response.id": "id-1",
                "gen_ai.response.model": "mock-model-id",
                "gen_ai.system": "mock-provider",
                "gen_ai.usage.input_tokens": 3,
                "gen_ai.usage.output_tokens": 10,
                "operation.name": "ai.streamText.doStream",
              },
              "events": [
                {
                  "attributes": {
                    "ai.response.msToFirstChunk": 400,
                  },
                  "name": "ai.stream.firstChunk",
                },
                {
                  "attributes": undefined,
                  "name": "ai.stream.finish",
                },
              ],
              "name": "ai.streamText.doStream",
            },
          ]
        `);
      });

      it('should have correct ui message stream', async () => {
        expect(await convertReadableStreamToArray(result.toUIMessageStream())).toMatchInlineSnapshot(`
            [
              {
                "type": "start",
              },
              {
                "type": "start-step",
              },
              {
                "id": "id-0",
                "type": "reasoning-start",
              },
              {
                "delta": "thinking",
                "id": "id-0",
                "type": "reasoning-delta",
              },
              {
                "id": "id-0",
                "type": "reasoning-end",
              },
              {
                "input": {
                  "value": "value",
                },
                "toolCallId": "call-1",
                "toolName": "tool1",
                "type": "tool-input-available",
              },
              {
                "output": "RESULT1",
                "toolCallId": "call-1",
                "type": "tool-output-available",
              },
              {
                "type": "finish-step",
              },
              {
                "type": "start-step",
              },
              {
                "id": "1",
                "type": "text-start",
              },
              {
                "delta": "Hello, ",
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

    describe('2 stop conditions', () => {
      let stopConditionCalls: Array<{
        number: number;
        steps: StepResult<any>[];
      }>;

      beforeEach(async () => {
        stopConditionCalls = [];

        let responseCount = 0;
        result = streamText({
          model: new MockLanguageModelV2({
            doStream: async () => {
              switch (responseCount++) {
                case 0: {
                  return {
                    stream: convertArrayToReadableStream([
                      {
                        type: 'response-metadata',
                        id: 'id-0',
                        modelId: 'mock-model-id',
                        timestamp: new Date(0),
                      },
                      {
                        type: 'reasoning-start',
                        id: 'id-0',
                      },
                      {
                        type: 'reasoning-delta',
                        id: 'id-0',
                        delta: 'thinking',
                      },
                      {
                        type: 'reasoning-end',
                        id: 'id-0',
                      },
                      {
                        type: 'tool-call',
                        id: 'call-1',
                        toolCallId: 'call-1',
                        toolName: 'tool1',
                        input: `{ "value": "value" }`,
                      },
                      {
                        type: 'finish',
                        finishReason: 'tool-calls',
                        usage: testUsage,
                      },
                    ]),
                    response: { headers: { call: '1' } },
                  };
                }
                default:
                  throw new Error(`Unexpected response count: ${responseCount}`);
              }
            },
          }),
          tools: {
            tool1: {
              inputSchema: z.object({ value: z.string() }),
              execute: async () => 'result1',
            },
          },
          prompt: 'test-input',
          experimental_telemetry: { isEnabled: true, tracer },
          stopWhen: [
            ({ steps }) => {
              stopConditionCalls.push({ number: 0, steps });
              return false;
            },
            ({ steps }) => {
              stopConditionCalls.push({ number: 1, steps });
              return true;
            },
          ],
          _internal: {
            now: mockValues(0, 100, 500, 600, 1000),
          },
        });
      });

      it('result.steps should contain a single step', async () => {
        await result.consumeStream();
        expect((await result.steps).length).toStrictEqual(1);
      });

      it('stopConditionCalls should be called for each stop condition', async () => {
        await result.consumeStream();
        expect(stopConditionCalls).toMatchInlineSnapshot(`
          [
            {
              "number": 0,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
            {
              "number": 1,
              "steps": [
                DefaultStepResult {
                  "content": [
                    {
                      "providerMetadata": undefined,
                      "text": "thinking",
                      "type": "reasoning",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-call",
                    },
                    {
                      "input": {
                        "value": "value",
                      },
                      "output": "result1",
                      "providerExecuted": undefined,
                      "providerMetadata": undefined,
                      "toolCallId": "call-1",
                      "toolName": "tool1",
                      "type": "tool-result",
                    },
                  ],
                  "finishReason": "tool-calls",
                  "providerMetadata": undefined,
                  "request": {},
                  "response": {
                    "headers": {
                      "call": "1",
                    },
                    "id": "id-0",
                    "messages": [
                      {
                        "content": [
                          {
                            "providerOptions": undefined,
                            "text": "thinking",
                            "type": "reasoning",
                          },
                          {
                            "input": {
                              "value": "value",
                            },
                            "providerExecuted": undefined,
                            "providerOptions": undefined,
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-call",
                          },
                        ],
                        "role": "assistant",
                      },
                      {
                        "content": [
                          {
                            "output": {
                              "type": "text",
                              "value": "result1",
                            },
                            "toolCallId": "call-1",
                            "toolName": "tool1",
                            "type": "tool-result",
                          },
                        ],
                        "role": "tool",
                      },
                    ],
                    "modelId": "mock-model-id",
                    "timestamp": 1970-01-01T00:00:00.000Z,
                  },
                  "usage": {
                    "cachedInputTokens": undefined,
                    "inputTokens": 3,
                    "outputTokens": 10,
                    "reasoningTokens": undefined,
                    "totalTokens": 13,
                  },
                  "warnings": [],
                },
              ],
            },
          ]
        `);
      });
    });
  });

  describe('options.onFinish', () => {
    it.skip('should send correct information', async () => {
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
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ', ' },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: `{ "value": "value" }`,
            },
            { type: 'text-delta', id: '1', delta: `world!` },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage,
              providerMetadata: {
                testProvider: { testKey: 'testValue' },
              },
            },
          ]),
          response: { headers: { call: '2' } },
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        options: {
          onFinish: async event => {
            result = event as unknown as typeof result;
          },
        },
        ...defaultSettings(),
      });

      await resultObject.aisdk.v5.consumeStream();

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "providerMetadata": undefined,
              "text": "Hello, world!",
              "type": "text",
            },
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
            {
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "providerMetadata": {
            "testProvider": {
              "testKey": "testValue",
            },
          },
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
          "response": {
            "headers": {
              "call": "2",
            },
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello, world!",
                    "type": "text",
                  },
                  {
                    "input": {
                      "value": "value",
                    },
                    "providerExecuted": undefined,
                    "providerOptions": undefined,
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-call",
                  },
                ],
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "output": {
                      "type": "text",
                      "value": "value-result",
                    },
                    "toolCallId": "call-1",
                    "toolName": "tool1",
                    "type": "tool-result",
                  },
                ],
                "role": "tool",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "sources": [],
          "staticToolCalls": [],
          "staticToolResults": [],
          "steps": [
            DefaultStepResult {
              "content": [
                {
                  "providerMetadata": undefined,
                  "text": "Hello, world!",
                  "type": "text",
                },
                {
                  "input": {
                    "value": "value",
                  },
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-call",
                },
                {
                  "input": {
                    "value": "value",
                  },
                  "output": "value-result",
                  "providerExecuted": undefined,
                  "providerMetadata": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "tool-result",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": {
                "testProvider": {
                  "testKey": "testValue",
                },
              },
              "request": {},
              "response": {
                "headers": {
                  "call": "2",
                },
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello, world!",
                        "type": "text",
                      },
                      {
                        "input": {
                          "value": "value",
                        },
                        "providerExecuted": undefined,
                        "providerOptions": undefined,
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-call",
                      },
                    ],
                    "role": "assistant",
                  },
                  {
                    "content": [
                      {
                        "output": {
                          "type": "text",
                          "value": "value-result",
                        },
                        "toolCallId": "call-1",
                        "toolName": "tool1",
                        "type": "tool-result",
                      },
                    ],
                    "role": "tool",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello, world!",
          "toolCalls": [
            {
              "input": {
                "value": "value",
              },
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-call",
            },
          ],
          "toolResults": [
            {
              "input": {
                "value": "value",
              },
              "output": "value-result",
              "providerExecuted": undefined,
              "providerMetadata": undefined,
              "toolCallId": "call-1",
              "toolName": "tool1",
              "type": "tool-result",
            },
          ],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
    });

    it.skip('should send sources', async () => {
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

      await resultObject.aisdk.v5.consumeStream();

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "id": "123",
              "providerMetadata": {
                "provider": {
                  "custom": "value",
                },
              },
              "sourceType": "url",
              "title": "Example",
              "type": "source",
              "url": "https://example.com",
            },
            {
              "providerMetadata": undefined,
              "text": "Hello!",
              "type": "text",
            },
            {
              "id": "456",
              "providerMetadata": {
                "provider": {
                  "custom": "value2",
                },
              },
              "sourceType": "url",
              "title": "Example 2",
              "type": "source",
              "url": "https://example.com/2",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [],
          "finishReason": "stop",
          "providerMetadata": undefined,
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
          "response": {
            "headers": undefined,
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "providerOptions": undefined,
                    "text": "Hello!",
                    "type": "text",
                  },
                ],
                "role": "assistant",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "sources": [
            {
              "id": "123",
              "providerMetadata": {
                "provider": {
                  "custom": "value",
                },
              },
              "sourceType": "url",
              "title": "Example",
              "type": "source",
              "url": "https://example.com",
            },
            {
              "id": "456",
              "providerMetadata": {
                "provider": {
                  "custom": "value2",
                },
              },
              "sourceType": "url",
              "title": "Example 2",
              "type": "source",
              "url": "https://example.com/2",
            },
          ],
          "staticToolCalls": [],
          "staticToolResults": [],
          "steps": [
            DefaultStepResult {
              "content": [
                {
                  "id": "123",
                  "providerMetadata": {
                    "provider": {
                      "custom": "value",
                    },
                  },
                  "sourceType": "url",
                  "title": "Example",
                  "type": "source",
                  "url": "https://example.com",
                },
                {
                  "providerMetadata": undefined,
                  "text": "Hello!",
                  "type": "text",
                },
                {
                  "id": "456",
                  "providerMetadata": {
                    "provider": {
                      "custom": "value2",
                    },
                  },
                  "sourceType": "url",
                  "title": "Example 2",
                  "type": "source",
                  "url": "https://example.com/2",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "providerOptions": undefined,
                        "text": "Hello!",
                        "type": "text",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello!",
          "toolCalls": [],
          "toolResults": [],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
    });

    it.skip('should send files', async () => {
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

      await resultObject.aisdk.v5.consumeStream();

      expect(result).toMatchInlineSnapshot(`
        {
          "content": [
            {
              "file": DefaultGeneratedFileWithType {
                "base64Data": "Hello World",
                "mediaType": "text/plain",
                "type": "file",
                "uint8ArrayData": undefined,
              },
              "type": "file",
            },
            {
              "providerMetadata": undefined,
              "text": "Hello!",
              "type": "text",
            },
            {
              "file": DefaultGeneratedFileWithType {
                "base64Data": "QkFVRw==",
                "mediaType": "image/jpeg",
                "type": "file",
                "uint8ArrayData": undefined,
              },
              "type": "file",
            },
          ],
          "dynamicToolCalls": [],
          "dynamicToolResults": [],
          "files": [
            DefaultGeneratedFileWithType {
              "base64Data": "Hello World",
              "mediaType": "text/plain",
              "type": "file",
              "uint8ArrayData": undefined,
            },
            DefaultGeneratedFileWithType {
              "base64Data": "QkFVRw==",
              "mediaType": "image/jpeg",
              "type": "file",
              "uint8ArrayData": undefined,
            },
          ],
          "finishReason": "stop",
          "providerMetadata": undefined,
          "reasoning": [],
          "reasoningText": undefined,
          "request": {},
          "response": {
            "headers": undefined,
            "id": "id-0",
            "messages": [
              {
                "content": [
                  {
                    "data": "Hello World",
                    "mediaType": "text/plain",
                    "providerOptions": undefined,
                    "type": "file",
                  },
                  {
                    "providerOptions": undefined,
                    "text": "Hello!",
                    "type": "text",
                  },
                  {
                    "data": "QkFVRw==",
                    "mediaType": "image/jpeg",
                    "providerOptions": undefined,
                    "type": "file",
                  },
                ],
                "role": "assistant",
              },
            ],
            "modelId": "mock-model-id",
            "timestamp": 1970-01-01T00:00:00.000Z,
          },
          "sources": [],
          "staticToolCalls": [],
          "staticToolResults": [],
          "steps": [
            DefaultStepResult {
              "content": [
                {
                  "file": DefaultGeneratedFileWithType {
                    "base64Data": "Hello World",
                    "mediaType": "text/plain",
                    "type": "file",
                    "uint8ArrayData": undefined,
                  },
                  "type": "file",
                },
                {
                  "providerMetadata": undefined,
                  "text": "Hello!",
                  "type": "text",
                },
                {
                  "file": DefaultGeneratedFileWithType {
                    "base64Data": "QkFVRw==",
                    "mediaType": "image/jpeg",
                    "type": "file",
                    "uint8ArrayData": undefined,
                  },
                  "type": "file",
                },
              ],
              "finishReason": "stop",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "messages": [
                  {
                    "content": [
                      {
                        "data": "Hello World",
                        "mediaType": "text/plain",
                        "providerOptions": undefined,
                        "type": "file",
                      },
                      {
                        "providerOptions": undefined,
                        "text": "Hello!",
                        "type": "text",
                      },
                      {
                        "data": "QkFVRw==",
                        "mediaType": "image/jpeg",
                        "providerOptions": undefined,
                        "type": "file",
                      },
                    ],
                    "role": "assistant",
                  },
                ],
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "usage": {
                "cachedInputTokens": undefined,
                "inputTokens": 3,
                "outputTokens": 10,
                "reasoningTokens": undefined,
                "totalTokens": 13,
              },
              "warnings": [],
            },
          ],
          "text": "Hello!",
          "toolCalls": [],
          "toolResults": [],
          "totalUsage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "usage": {
            "cachedInputTokens": undefined,
            "inputTokens": 3,
            "outputTokens": 10,
            "reasoningTokens": undefined,
            "totalTokens": 13,
          },
          "warnings": [],
        }
      `);
    });

    it('should not prevent error from being forwarded', async () => {
      const result = await executeFn({
        runId,
        model: new MockLanguageModelV2({
          doStream: async () => {
            throw new Error('test error');
          },
        }),
        prompt: 'test-input',
        options: {
          onFinish() {}, // just defined; do nothing
          onError: () => {},
        },
      });

      expect((await convertAsyncIterableToArray(result.aisdk.v5.fullStream as any)).slice(0, 3)).toStrictEqual([
        {
          type: 'start',
        },
        {
          type: 'start-step',
          request: {},
          warnings: [],
        },
        {
          type: 'error',
          error: new Error('test error'),
        },
      ]);
    });
  });

  describe('options.onChunk', () => {
    let result: Array<
      Extract<
        TextStreamPart<any>,
        {
          type:
            | 'text-delta'
            | 'reasoning-delta'
            | 'source'
            | 'tool-call'
            | 'tool-input-start'
            | 'tool-input-delta'
            | 'tool-result'
            | 'raw';
        }
      >
    >;

    beforeEach(async () => {
      result = [];

      const resultObject = await executeFn({
        runId,
        model: createTestModel({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
            { type: 'tool-input-start', id: '2', toolName: 'tool1' },
            { type: 'tool-input-delta', id: '2', delta: '{"value": "' },
            { type: 'reasoning-start', id: '3' },
            { type: 'reasoning-delta', id: '3', delta: 'Feeling clever' },
            { type: 'reasoning-end', id: '3' },
            { type: 'tool-input-delta', id: '2', delta: 'test' },
            { type: 'tool-input-delta', id: '2', delta: '"}' },
            {
              type: 'source',
              sourceType: 'url',
              id: '123',
              url: 'https://example.com',
              title: 'Example',
              providerMetadata: { provider: { custom: 'value' } },
            },
            { type: 'tool-input-end', id: '2' },
            {
              type: 'tool-call',
              toolCallId: '2',
              toolName: 'tool1',
              input: `{ "value": "test" }`,
              providerMetadata: { provider: { custom: 'value' } },
            },
            { type: 'text-start', id: '4' },
            { type: 'text-delta', id: '4', delta: ' World' },
            { type: 'text-end', id: '4' },
            {
              type: 'finish',
              finishReason: 'stop',
              usage: testUsage2,
            },
          ]),
        }),
        tools: {
          tool1: {
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => `${value}-result`,
          },
        },
        prompt: 'test-input',
        options: {
          onChunk(event) {
            result.push(event.chunk);
          },
        },
      });

      await resultObject.aisdk.v5.consumeStream();
    });

    it('should return events in order', async () => {
      expect(result).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "providerMetadata": undefined,
            "text": "Hello",
            "type": "text-delta",
          },
          {
            "dynamic": false,
            "id": "2",
            "toolName": "tool1",
            "type": "tool-input-start",
          },
          {
            "delta": "{"value": "",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "id": "3",
            "providerMetadata": undefined,
            "text": "Feeling clever",
            "type": "reasoning-delta",
          },
          {
            "delta": "test",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "delta": ""}",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "id": "123",
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "sourceType": "url",
            "title": "Example",
            "type": "source",
            "url": "https://example.com",
          },
          {
            "input": {
              "value": "test",
            },
            "providerExecuted": undefined,
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "toolCallId": "2",
            "toolName": "tool1",
            "type": "tool-call",
          },
          {
            "id": "4",
            "providerMetadata": undefined,
            "text": " World",
            "type": "text-delta",
          },
          {
            "input": {
              "value": "test",
            },
            "output": "test-result",
            "providerExecuted": undefined,
            "providerMetadata": {
              "provider": {
                "custom": "value",
              },
            },
            "toolCallId": "2",
            "toolName": "tool1",
            "type": "tool-result",
          },
        ]
      `);
    });
  });
}
