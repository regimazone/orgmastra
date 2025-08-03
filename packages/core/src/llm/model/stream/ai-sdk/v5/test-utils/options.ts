import { convertAsyncIterableToArray } from '@ai-sdk/provider-utils/test';
import type { LanguageModelV2FunctionTool, LanguageModelV2ProviderDefinedTool } from '@ai-sdk/provider-v5';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai-v5/test';
import { describe, expect, it, vi } from 'vitest';
import z from 'zod';
import type { execute } from '../../../execute';
import { createTestModel, testUsage } from './test-utils';

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
}
