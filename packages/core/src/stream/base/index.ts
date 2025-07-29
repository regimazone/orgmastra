import { ReadableStream, TransformStream } from 'stream/web';
import { MastraBase } from '../../base';
import { AISDKV4OutputStream } from '../aisdk/v4';
import { AISDKV5OutputStream } from '../aisdk/v5';
import type { ChunkType } from '../types';

type CreateStream = () => Promise<ReadableStream<any>> | ReadableStream<any>;
export abstract class BaseModelStream extends MastraBase {
  abstract transform({
    runId,
    stream,
    controller,
  }: {
    runId: string;
    stream: ReadableStream<any>;
    controller: ReadableStreamDefaultController<ChunkType>;
  }): Promise<void>;

  initialize({ runId, createStream }: { createStream: CreateStream; runId: string }) {
    const self = this;
    const stream = new ReadableStream<ChunkType>({
      async start(controller) {
        controller.enqueue({
          type: 'start',
          runId,
          from: 'AGENT',
          payload: {},
        });

        try {
          const stream = await createStream();

          await self.transform({
            runId,
            stream,
            controller,
          });

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return stream;
  }
}

export class MastraModelOutput extends MastraBase {
  #aisdkv4: AISDKV4OutputStream;
  #aisdkv5: AISDKV5OutputStream;
  #baseStream: ReadableStream<any>;
  #bufferedText: string[] = [];
  #toolCallArgsDeltas: Record<string, string[]> = {};
  #toolCalls: any[] = [];
  #toolResults: any[] = [];
  #finishReason: string | undefined;
  #usageCount: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor({ stream, options }: { stream: ReadableStream<ChunkType>; options: { toolCallStreaming?: boolean } }) {
    super({ component: 'LLM', name: 'MastraModelOutput' });
    const self = this;
    this.#baseStream = stream.pipeThrough(
      new TransformStream<ChunkType, ChunkType>({
        transform(chunk, controller) {
          switch (chunk.type) {
            case 'text-delta':
              self.#bufferedText.push(chunk.payload.text);
              break;
            case 'tool-call-delta':
              if (!self.#toolCallArgsDeltas[chunk.payload.toolCallId]) {
                self.#toolCallArgsDeltas[chunk.payload.toolCallId] = [];
              }
              self.#toolCallArgsDeltas?.[chunk.payload.toolCallId]?.push(chunk.payload.argsTextDelta);
              break;
            case 'text-delta':
              self.#bufferedText.push(chunk.payload.text);
              break;
            case 'tool-call':
              self.#toolCalls.push(chunk.payload);
              if (chunk.payload?.output?.from === 'AGENT' && chunk.payload?.output?.type === 'finish') {
                const finishPayload = chunk.payload?.output.payload;
                self.updateUsageCount(finishPayload.usage);
              }
              break;
            case 'tool-result':
              self.#toolResults.push(chunk.payload);
              break;
            case 'step-finish': {
              console.log(chunk, '####');
              self.updateUsageCount(chunk.payload.totalUsage);
              chunk.payload.totalUsage = self.#usageCount;
              break;
            }
            case 'finish':
              if (chunk.payload.reason) {
                self.#finishReason = chunk.payload.reason;
              }
              self.#usageCount = chunk.payload.totalUsage;
              break;
          }
          controller.enqueue(chunk);
        },
      }),
    );

    console.log('options', options);

    this.#aisdkv4 = new AISDKV4OutputStream({
      modelOutput: this,
      options: {
        toolCallStreaming: options?.toolCallStreaming,
      },
    });

    this.#aisdkv5 = new AISDKV5OutputStream({
      modelOutput: this,
      options: {
        toolCallStreaming: options?.toolCallStreaming,
      },
    });
  }

  get text() {
    return this.#bufferedText.join('');
  }

  teeStream() {
    const [stream1, stream2] = this.#baseStream.tee();
    this.#baseStream = stream2;
    return stream1;
  }

  get fullStream() {
    return this.teeStream().pipeThrough(
      new TransformStream<ChunkType, ChunkType>({
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      }),
    );
  }

  get textStream() {
    return this.teeStream().pipeThrough(
      new TransformStream<ChunkType, string>({
        transform(chunk, controller) {
          if (chunk.type === 'text-delta') {
            controller.enqueue(chunk.payload.text);
          }
        },
      }),
    );
  }

  get finishReason() {
    return this.#finishReason;
  }

  get toolCalls() {
    return this.#toolCalls;
  }

  get toolResults() {
    return this.#toolResults;
  }

  get usage() {
    return this.#usageCount;
  }

  updateUsageCount(usage: {
    promptTokens?: `${number}` | number;
    completionTokens?: `${number}` | number;
    totalTokens?: `${number}` | number;
  }) {
    console.log('UPDATE USAGE COUNT', usage);
    this.#usageCount.promptTokens += parseInt(usage.promptTokens?.toString() ?? '0', 10);
    this.#usageCount.completionTokens += parseInt(usage.completionTokens?.toString() ?? '0', 10);
    this.#usageCount.totalTokens += parseInt(usage.totalTokens?.toString() ?? '0', 10);
  }

  get aisdk() {
    return {
      v4: this.#aisdkv4,
      v5: this.#aisdkv5,
    };
  }
}
