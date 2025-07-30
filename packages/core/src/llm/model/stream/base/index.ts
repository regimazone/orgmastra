import { ReadableStream, TransformStream } from 'stream/web';
import { MastraBase } from '../../../../base';
import type { ChunkType } from '../../../../stream/types';
import { AISDKV4OutputStream } from '../ai-sdk/v4';
import { AISDKV5OutputStream } from '../ai-sdk/v5/output';
import type { CreateStream, OnResult } from '../types';

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

  initialize({ runId, createStream, onResult }: { createStream: CreateStream; runId: string; onResult: OnResult }) {
    const self = this;

    const stream = new ReadableStream<ChunkType>({
      async start(controller) {
        try {
          const stream = (await createStream()) as any;

          onResult({
            warnings: stream.warnings,
            request: stream.request,
            rawResponse: stream.rawResponse,
          });

          await self.transform({
            runId,
            stream: stream.stream,
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
  #bufferedSteps: any[] = [];
  #bufferedText: string[] = [];
  #bufferedSources: any[] = [];
  #bufferedReasoning: string[] = [];
  #bufferedFiles: any[] = [];
  #toolCallArgsDeltas: Record<string, string[]> = {};
  #toolCalls: any[] = [];
  #toolResults: any[] = [];
  #warnings: any[] = [];
  #finishReason: string | undefined;
  #providerMetadata: Record<string, any> | undefined;
  #response: any | undefined;
  #request: any | undefined;
  #usageCount: Record<string, number> = {};

  constructor({
    stream,
    options,
  }: {
    stream: ReadableStream<ChunkType>;
    options: {
      toolCallStreaming?: boolean;
      onFinish?: (event: any) => Promise<void> | void;
    };
  }) {
    super({ component: 'LLM', name: 'MastraModelOutput' });
    const self = this;
    this.#baseStream = stream.pipeThrough(
      new TransformStream<ChunkType, ChunkType>({
        transform: async (chunk, controller) => {
          switch (chunk.type) {
            case 'source':
              self.#bufferedSources.push(chunk.payload.source);
              break;
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
            case 'file':
              self.#bufferedFiles.push(chunk.payload);
              break;
            case 'reasoning':
              self.#bufferedReasoning.push(chunk.payload.text);
              break;
            case 'tool-call':
              self.#toolCalls.push({ type: 'tool-call', ...chunk.payload });
              if (chunk.payload?.output?.from === 'AGENT' && chunk.payload?.output?.type === 'finish') {
                const finishPayload = chunk.payload?.output.payload;
                self.updateUsageCount(finishPayload.usage);
              }
              break;
            case 'tool-result':
              self.#toolResults.push({ type: 'tool-result', ...chunk.payload });
              break;
            case 'step-finish': {
              self.updateUsageCount(chunk.payload.output.usage);
              chunk.payload.totalUsage = self.totalUsage;
              self.#warnings = chunk.payload.stepResult.warnings;

              if (chunk.payload.metadata.request) {
                self.#request = chunk.payload.metadata.request;
              }

              const reasoningDetails = chunk.payload.messages.all
                ?.flatMap((msg: any) => {
                  return msg.content;
                })
                ?.filter((message: any) => message.type.includes('reasoning'))
                ?.map((msg: any) => {
                  let type;
                  if (msg.type === 'reasoning') {
                    type = 'text';
                  } else if (msg.type === 'redacted-reasoning') {
                    type = 'redacted';
                  }

                  return {
                    ...msg,
                    type,
                  };
                });

              self.#bufferedSteps.push({
                stepType: 'initial',
                text: self.text,
                reasoning: self.reasoning || undefined,
                sources: self.sources,
                files: self.files,
                toolCalls: self.toolCalls,
                toolResults: self.toolResults,
                warnings: self.warnings,
                reasoningDetails,
                providerMetadata: chunk.payload.metadata.providerMetadata,
                experimental_providerMetadata: chunk.payload.metadata.providerMetadata,
                isContinued: chunk.payload.stepResult.isContinued,
                logprobs: chunk.payload.stepResult.logprobs,
                finishReason: chunk.payload.stepResult.reason,
                response: { ...chunk.payload.metadata },
                request: chunk.payload.metadata.request,
                usage: chunk.payload.output.usage,
              });

              break;
            }
            case 'finish':
              console.log('MY FINISH CHUNK', JSON.stringify(chunk, null, 2));
              if (chunk.payload.stepResult.reason) {
                self.#finishReason = chunk.payload.stepResult.reason;
              }

              if (chunk.payload.metadata.providerMetadata) {
                self.#providerMetadata = chunk.payload.metadata.providerMetadata;
              }

              if (chunk.payload.metadata) {
                self.#response = {
                  ...chunk.payload.metadata,
                  messages: chunk.payload.messages.all,
                };
              }

              self.#usageCount = chunk.payload.output.usage;

              const baseFinishStep = self.#bufferedSteps[self.#bufferedSteps.length - 1];

              if (baseFinishStep) {
                const { stepType: _stepType, isContinued: _isContinued, ...rest } = baseFinishStep;

                console.log('FINISH CHUNK', JSON.stringify(chunk.payload.messages, null, 2));

                await options?.onFinish?.({
                  finishReason: chunk.payload.stepResult.reason,
                  steps: self.#bufferedSteps,
                  experimental_providerMetadata: chunk.payload.metadata.providerMetadata,
                  response: {
                    ...rest.metadata,
                    messages: chunk.payload.messages.all,
                  },
                });
              }

              break;
          }
          controller.enqueue(chunk);
        },
      }),
    );

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

  get reasoning() {
    return this.#bufferedReasoning.join('');
  }

  get sources() {
    return this.#bufferedSources;
  }

  get files() {
    return this.#bufferedFiles;
  }

  get steps() {
    console.log('steps getter', this.#bufferedSteps);
    return this.#bufferedSteps;
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

  get warnings() {
    return this.#warnings;
  }

  get providerMetadata() {
    return this.#providerMetadata;
  }

  get response() {
    return this.#response;
  }

  get request() {
    return this.#request;
  }

  updateUsageCount(usage: Record<string, number>) {
    if (!usage) {
      return;
    }

    for (const [key, value] of Object.entries(usage)) {
      this.#usageCount[key] = (this.#usageCount[key] ?? 0) + (value ?? 0);
    }
  }

  get totalUsage() {
    let total = 0;
    for (const [key, value] of Object.entries(this.#usageCount)) {
      if (key !== 'totalTokens') {
        total += value;
      }
    }
    return {
      ...this.#usageCount,
      totalTokens: total,
    };
  }

  get aisdk() {
    return {
      v4: this.#aisdkv4,
      v5: this.#aisdkv5,
    };
  }
}
