import { ReadableStream, TransformStream } from 'stream/web';
import type { LanguageModelV1StreamPart } from 'ai';
import type { ChunkType } from './types';

function convertFullStreamChunkToAISDKv4(chunk: any) {
  if (chunk.type === 'text-delta') {
    return {
      type: 'text-delta',
      textDelta: chunk.payload.text,
    };
  } else if (chunk.type === 'step-start') {
    return {
      type: 'step-start',
      ...(chunk.payload || {}),
    };
  } else if (chunk.type === 'step-finish') {
    const { totalUsage, reason, ...rest } = chunk.payload;
    console.log('Step finish chunk', chunk);
    return {
      usage: {
        promptTokens: totalUsage.promptTokens,
        completionTokens: totalUsage.completionTokens,
        totalTokens: totalUsage.totalTokens || totalUsage.promptTokens + totalUsage.completionTokens,
      },
      ...rest,
      finishReason: reason,
      type: 'step-finish',
    };
  } else if (chunk.type === 'finish') {
    return {
      type: 'finish',
      ...chunk.payload,
    };
  } else if (chunk.type === 'reasoning') {
    return {
      type: 'reasoning',
      textDelta: chunk.payload.text,
    };
  } else if (chunk.type === 'reasoning-signature') {
    return {
      type: 'reasoning-signature',
      signature: chunk.payload.signature,
    };
  } else if (chunk.type === 'redacted-reasoning') {
    return {
      type: 'redacted-reasoning',
      data: chunk.payload.data,
    };
  }
}

function convertFullStreamChunkToMastra(value: any, ctx: { runId: string }, write: (chunk: any) => void) {
  if (value.type === 'step-start') {
    write({
      type: 'step-start',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        messageId: value.messageId,
        request: { body: JSON.parse(value.request!.body ?? '{}') },
        warnings: value.warnings,
      },
    });
  } else if (value.type === 'tool-call') {
    write({
      type: 'tool-call',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        toolCallId: value.toolCallId,
        args: value.args,
        toolName: value.toolName,
      },
    });
  } else if (value.type === 'tool-result') {
    write({
      type: 'tool-result',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        result: value.result,
      },
    });
  } else if (value.type === 'text-delta') {
    if (value.textDelta) {
      write({
        type: 'text-delta',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          text: value.textDelta,
        },
      });
    }
  } else if (value.type === 'step-finish') {
    write({
      type: 'step-finish',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        reason: value.finishReason,
        usage: value.usage,
        response: value.response,
        messageId: value.messageId,
        providerMetadata: value.providerMetadata,
      },
    });
  } else if (value.type === 'finish') {
    const { finishReason, usage, providerMetadata, ...rest } = value;
    write({
      type: 'finish',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        reason: value.finishReason,
        usage: value.usage,
        providerMetadata: value.providerMetadata,
        ...rest,
      },
    });
  } else if (value.type === 'response-metadata') {
    write({
      type: 'response-metadata',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value,
    });
  } else if (value.type === 'reasoning') {
    write({
      type: 'reasoning',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        text: value.textDelta,
      },
    });
  } else if (value.type === 'reasoning-signature') {
    write({
      type: 'reasoning-signature',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        signature: value.signature,
      },
    });
  } else if (value.type === 'redacted-reasoning') {
    write({
      type: 'redacted-reasoning',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        data: value.data,
      },
    });
  }
}

export class MastraAgentStream<Output> extends ReadableStream<ChunkType> {
  #usageCount = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  #bufferedText: string[] = [];
  #toolResults: Record<string, any>[] = [];
  #toolCalls: Record<string, any>[] = [];
  #finishReason: string | null = null;
  #streamPromise: {
    promise: Promise<void>;
    resolve: (value: void) => void;
    reject: (reason?: any) => void;
  };
  #resultAsObject: Output | null = null;

  constructor({
    createStream,
    getOptions,
  }: {
    createStream: (
      writer: WritableStream<ChunkType>,
      onResult: (result: Output) => void,
    ) => Promise<ReadableStream<any>> | ReadableStream<any>;
    getOptions: () =>
      | Promise<{
          runId: string;
        }>
      | {
          runId: string;
        };
  }) {
    const deferredPromise = {
      promise: null,
      resolve: null,
      reject: null,
    } as unknown as {
      promise: Promise<void>;
      resolve: (value: void) => void;
      reject: (reason?: any) => void;
    };
    deferredPromise.promise = new Promise((resolve, reject) => {
      deferredPromise.resolve = resolve;
      deferredPromise.reject = reject;
    });

    super({
      start: async controller => {
        const { runId } = await getOptions();

        const writer = new WritableStream<ChunkType>({
          write: chunk => {
            if (
              chunk.type === 'tool-output' &&
              chunk.payload?.output?.from === 'AGENT' &&
              chunk.payload?.output?.type === 'finish'
            ) {
              const finishPayload = chunk.payload?.output.payload;
              updateUsageCount(finishPayload.usage);
            }

            controller.enqueue(chunk);
          },
        });

        controller.enqueue({
          type: 'start',
          runId,
          from: 'AGENT',
          payload: {},
        });

        const updateUsageCount = (usage: {
          promptTokens?: `${number}` | number;
          completionTokens?: `${number}` | number;
          totalTokens?: `${number}` | number;
        }) => {
          this.#usageCount.promptTokens += parseInt(usage.promptTokens?.toString() ?? '0', 10);
          this.#usageCount.completionTokens += parseInt(usage.completionTokens?.toString() ?? '0', 10);
          this.#usageCount.totalTokens += parseInt(usage.totalTokens?.toString() ?? '0', 10);
        };

        try {
          const stream = await createStream(writer, result => {
            this.#resultAsObject = result;
          });

          for await (const chunk of stream) {
            convertFullStreamChunkToMastra(chunk, { runId }, chunk => {
              switch (chunk.type) {
                case 'text-delta':
                  this.#bufferedText.push(chunk.payload.text);
                  break;
                case 'tool-call':
                  this.#toolCalls.push(chunk.payload);
                  break;
                case 'tool-result':
                  this.#toolResults.push(chunk.payload);
                  break;
                case 'step-finish':
                case 'finish':
                  if (chunk.payload.reason) {
                    this.#finishReason = chunk.payload.reason;
                  }
                  updateUsageCount(chunk.payload.usage);
                  chunk.payload.totalUsage = this.#usageCount;
                  break;
              }

              controller.enqueue(chunk);
            });
          }

          controller.close();
          deferredPromise.resolve();
        } catch (error) {
          controller.error(error);
          deferredPromise.reject(error);
        }
      },
    });

    this.#streamPromise = deferredPromise;
  }

  get aisdkv4() {
    return this.pipeThrough(
      new TransformStream<ChunkType, LanguageModelV1StreamPart>({
        transform(chunk, controller) {
          const transformedChunk = convertFullStreamChunkToAISDKv4(chunk);

          if (transformedChunk) {
            controller.enqueue(transformedChunk as LanguageModelV1StreamPart);
          }
        },
      }),
    );
  }

  get finishReason() {
    return this.#streamPromise.promise.then(() => this.#finishReason);
  }

  get toolCalls() {
    return this.#streamPromise.promise.then(() => this.#toolCalls);
  }

  get toolResults() {
    return this.#streamPromise.promise.then(() => this.#toolResults);
  }

  get usage() {
    return this.#streamPromise.promise.then(() => this.#usageCount);
  }

  get text() {
    return this.#streamPromise.promise.then(() => this.#bufferedText.join(''));
  }

  get object(): Promise<Output extends undefined ? null : Output> {
    return this.#streamPromise.promise.then(() => this.#resultAsObject) as Promise<
      Output extends undefined ? null : Output
    >;
  }

  get textStream() {
    return this.pipeThrough(
      new TransformStream<ChunkType, string>({
        transform(chunk, controller) {
          if (chunk.type === 'text-delta') {
            controller.enqueue(chunk.payload.text);
          }
        },
      }),
    );
  }
}
