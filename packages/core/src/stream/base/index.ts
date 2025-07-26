import { ReadableStream, TransformStream } from 'stream/web';
import { MastraBase } from '../../base';
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

  constructor({ stream }: { stream: ReadableStream<ChunkType> }) {
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
                controller.enqueue({
                  type: 'tool-call-streaming-start',
                  from: 'AGENT',
                  runId: chunk.runId,
                  payload: {
                    toolCallId: chunk.payload.toolCallId,
                    toolName: chunk.payload.toolName,
                  },
                });
              }
              self.#toolCallArgsDeltas?.[chunk.payload.toolCallId]?.push(chunk.payload.argsTextDelta);
              break;
            case 'text-delta':
              self.#bufferedText.push(chunk.payload.text);
              break;
            case 'tool-call':
              self.#toolCalls.push(chunk.payload);
              break;
            case 'tool-result':
              self.#toolResults.push(chunk.payload);
              break;
            case 'step-finish':
            case 'finish':
              if (chunk.payload.reason) {
                self.#finishReason = chunk.payload.reason;
              }
              console.log('USAGE', chunk);
              self.updateUsageCount(chunk.payload.totalUsage);
              chunk.payload.totalUsage = self.#usageCount;
              break;
          }
          controller.enqueue(chunk);
        },
      }),
    );
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
}
