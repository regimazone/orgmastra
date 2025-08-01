import type { ServerResponse } from 'http';
import type { LanguageModelV1CallWarning } from '@ai-sdk/provider';
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai';
import { MockLanguageModelV1, convertArrayToReadableStream, mockId } from 'ai/test';

const modelWithReasoning = new MockLanguageModelV1({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'response-metadata',
        id: 'id-0',
        modelId: 'mock-model-id',
        timestamp: new Date(0),
      },
      { type: 'reasoning', textDelta: 'I will open the conversation' },
      { type: 'reasoning', textDelta: ' with witty banter. ' },
      { type: 'reasoning-signature', signature: '1234567890' },
      { type: 'redacted-reasoning', data: 'redacted-reasoning-data' },
      { type: 'reasoning', textDelta: 'Once the user has relaxed,' },
      {
        type: 'reasoning',
        textDelta: ' I will pry for valuable information.',
      },
      { type: 'reasoning-signature', signature: '1234567890' },
      { type: 'text-delta', textDelta: 'Hi' },
      { type: 'text-delta', textDelta: ' there!' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]),
    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  }),
});

function createTestModel({
  stream = convertArrayToReadableStream([
    {
      type: 'response-metadata',
      id: 'id-0',
      modelId: 'mock-model-id',
      timestamp: new Date(0),
    },
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
  rawCall = { rawPrompt: 'prompt', rawSettings: {} },
  rawResponse = undefined,
  request = undefined,
  warnings,
}: {
  stream?: ReadableStream<LanguageModelV1StreamPart>;
  rawResponse?: { headers: Record<string, string> };
  rawCall?: { rawPrompt: string; rawSettings: Record<string, unknown> };
  request?: { body: string };
  warnings?: LanguageModelV1CallWarning[];
} = {}): LanguageModelV1 {
  return new MockLanguageModelV1({
    doStream: async () => ({ stream, rawCall, rawResponse, request, warnings }),
  });
}

const modelWithSources = new MockLanguageModelV1({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
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
      { type: 'text-delta', textDelta: 'Hello!' },
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
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
        providerMetadata: { testprovider: { testkey: 'testvalue' } },
      },
    ]),
    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  }),
});

const modelWithFiles = new MockLanguageModelV1({
  doStream: async () => ({
    stream: convertArrayToReadableStream([
      {
        type: 'file',
        data: 'Hello World',
        mimeType: 'text/plain',
      },
      { type: 'text-delta', textDelta: 'Hello!' },
      {
        type: 'file',
        data: 'QkFVRw==',
        mimeType: 'image/jpeg',
      },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]),
    rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  }),
});

class MockServerResponse {
  writtenChunks: any[] = [];
  headers = {};
  statusCode = 0;
  statusMessage = '';
  ended = false;

  write(chunk: any): void {
    this.writtenChunks.push(chunk);
  }

  end(): void {
    // You might want to mark the response as ended to simulate the real behavior
    this.ended = true;
  }

  writeHead(statusCode: number, statusMessage: string, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.headers = headers;
  }

  get body() {
    // Combine all written chunks into a single string
    return this.writtenChunks.join('');
  }

  /**
   * Get the decoded chunks as strings.
   */
  getDecodedChunks() {
    const decoder = new TextDecoder();
    return this.writtenChunks.map(chunk => decoder.decode(chunk));
  }

  /**
   * Wait for the stream to finish writing to the mock response.
   */
  async waitForEnd() {
    await new Promise(resolve => {
      const checkIfEnded = () => {
        if (this.ended) {
          resolve(undefined);
        } else {
          setImmediate(checkIfEnded);
        }
      };
      checkIfEnded();
    });
  }
}

export function createMockServerResponse(): ServerResponse & MockServerResponse {
  return new MockServerResponse() as ServerResponse & MockServerResponse;
}

export { modelWithReasoning, createTestModel, modelWithSources, modelWithFiles };

export const defaultSettings = () =>
  ({
    prompt: 'prompt',
    experimental_generateMessageId: mockId({ prefix: 'msg' }),
    _internal: {
      generateId: mockId({ prefix: 'id' }),
      currentDate: () => new Date(0),
    },
  }) as const;
