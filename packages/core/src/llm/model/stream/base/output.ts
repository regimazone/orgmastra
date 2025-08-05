import type { TelemetrySettings } from 'ai-v5';
import { MastraBase } from '../../../../base';
import type { ChunkType } from '../../../../stream/types';
import { assembleOperationName, getBaseTelemetryAttributes, getTracer } from '../ai-sdk/telemetry';
import { AISDKV4OutputStream, convertFullStreamChunkToAISDKv4 } from '../ai-sdk/v4';
import { AISDKV5OutputStream } from '../ai-sdk/v5/output';
import type { Span } from '@opentelemetry/api';

function reasoningDetailsFromMessages(messages: any[]) {
  return messages
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
}

export class MastraModelOutput extends MastraBase {
  #aisdkv4: AISDKV4OutputStream;
  #aisdkv5: AISDKV5OutputStream;
  #baseStream: ReadableStream<any>;
  #bufferedSteps: any[] = [];
  #bufferedReasoningDetails: Record<
    string,
    {
      type: string;
      text: string;
      providerMetadata: any;
    }
  > = {};
  #bufferedText: string[] = [];
  #bufferedTextChunks: Record<string, string[]> = {};
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
    model,
  }: {
    model: {
      modelId: string;
      provider: string;
      version: 'v1' | 'v2';
    };
    stream: ReadableStream<ChunkType>;
    options: {
      rootSpan?: Span;
      experimental_telemetry?: TelemetrySettings;
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
              self.#bufferedSources.push(chunk);
              break;
            case 'text-delta':
              self.#bufferedText.push(chunk.payload.text);
              if (chunk.payload.id) {
                const ary = self.#bufferedTextChunks[chunk.payload.id] ?? [];
                ary.push(chunk.payload.text);
                self.#bufferedTextChunks[chunk.payload.id] = ary;
              }
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
              self.#bufferedFiles.push(chunk);
              break;
            case 'reasoning-start':
              self.#bufferedReasoningDetails[chunk.payload.id] = {
                type: 'reasoning',
                text: '',
                providerMetadata: chunk.payload.providerMetadata,
              };
              break;
            case 'reasoning-delta': {
              self.#bufferedReasoning.push(chunk.payload.text);

              const bufferedReasoning = self.#bufferedReasoningDetails[chunk.payload.id];
              if (bufferedReasoning) {
                bufferedReasoning.text += chunk.payload.text;
                if (chunk.payload.providerMetadata) {
                  bufferedReasoning.providerMetadata = chunk.payload.providerMetadata;
                }
              }

              break;
            }
            case 'reasoning-end': {
              const bufferedReasoning = self.#bufferedReasoningDetails[chunk.payload.id];
              if (chunk.payload.providerMetadata && bufferedReasoning) {
                bufferedReasoning.providerMetadata = chunk.payload.providerMetadata;
              }
              break;
            }
            case 'tool-call':
              self.#toolCalls.push(chunk);
              if (chunk.payload?.output?.from === 'AGENT' && chunk.payload?.output?.type === 'finish') {
                const finishPayload = chunk.payload?.output.payload;
                self.updateUsageCount(finishPayload.usage);
              }
              break;
            case 'tool-result':
              self.#toolResults.push(chunk);
              break;
            case 'step-finish': {
              self.updateUsageCount(chunk.payload.output.usage);
              chunk.payload.totalUsage = self.totalUsage;
              self.#warnings = chunk.payload.stepResult.warnings;

              if (chunk.payload.metadata.request) {
                self.#request = chunk.payload.metadata.request;
              }

              const reasoningDetails = reasoningDetailsFromMessages(chunk.payload.messages.all);

              const { providerMetadata, request, ...otherMetadata } = chunk.payload.metadata;

              self.#bufferedSteps.push({
                stepType: 'initial',
                text: self.text,
                reasoning: self.reasoning || undefined,
                sources: self.sources,
                files: self.files,
                toolCalls: self.toolCalls,
                toolResults: self.toolResults,
                warnings: self.warnings,
                reasoningDetails: reasoningDetails,
                providerMetadata: providerMetadata,
                experimental_providerMetadata: providerMetadata,
                isContinued: chunk.payload.stepResult.isContinued,
                logprobs: chunk.payload.stepResult.logprobs,
                finishReason: chunk.payload.stepResult.reason,
                response: { ...otherMetadata, messages: chunk.payload.messages.nonUser },
                request: request,
                usage: chunk.payload.output.usage,
              });

              break;
            }
            case 'finish':
              if (chunk.payload.stepResult.reason) {
                self.#finishReason = chunk.payload.stepResult.reason;
              }

              if (chunk.payload.metadata) {
                const { providerMetadata, request, ...otherMetadata } = chunk.payload.metadata;

                self.#providerMetadata = chunk.payload.metadata.providerMetadata;

                self.#response = {
                  ...otherMetadata,
                  messages: chunk.payload.messages.all.slice(1),
                };
              }

              self.#usageCount = chunk.payload.output.usage;

              const baseFinishStep = self.#bufferedSteps[self.#bufferedSteps.length - 1];

              if (baseFinishStep) {
                const { stepType: _stepType, isContinued: _isContinued } = baseFinishStep;

                const { providerMetadata, request, ...otherMetadata } = chunk.payload.metadata;

                let onFinishPayload: any = {};

                if (model.version === 'v1') {
                  onFinishPayload = {
                    text: baseFinishStep.text,
                    warnings: baseFinishStep.warnings,
                    finishReason: chunk.payload.stepResult.reason,
                    experimental_providerMetadata: chunk.payload.metadata.providerMetadata,
                    providerMetadata: chunk.payload.metadata.providerMetadata,
                    files: baseFinishStep.files.map((file: any) => {
                      return convertFullStreamChunkToAISDKv4({
                        chunk: file,
                        client: false,
                        sendReasoning: false,
                        sendSources: false,
                        sendUsage: false,
                        getErrorMessage: (error: string) => error,
                      });
                    }),
                    toolCalls: baseFinishStep.toolCalls.map((toolCall: any) => {
                      return convertFullStreamChunkToAISDKv4({
                        chunk: toolCall,
                        client: false,
                        sendReasoning: false,
                        sendSources: false,
                        sendUsage: false,
                        getErrorMessage: (error: string) => error,
                      });
                    }),
                    toolResults: baseFinishStep.toolResults.map((toolResult: any) => {
                      return convertFullStreamChunkToAISDKv4({
                        chunk: toolResult,
                        client: false,
                        sendReasoning: false,
                        sendSources: false,
                        sendUsage: false,
                        getErrorMessage: (error: string) => error,
                      });
                    }),
                    logprobs: baseFinishStep.logprobs,
                    reasoning: baseFinishStep.reasoning,
                    reasoningDetails: baseFinishStep.reasoningDetails,
                    sources: baseFinishStep.sources.map((source: any) => {
                      return convertFullStreamChunkToAISDKv4({
                        chunk: source,
                        client: false,
                        sendReasoning: false,
                        sendSources: true,
                        sendUsage: false,
                        getErrorMessage: (error: string) => error,
                      }).source;
                    }),
                    request: request || {},
                    response: {
                      ...otherMetadata,
                      messages: chunk.payload.messages.all.slice(1).map((message: any) => {
                        return {
                          ...message,
                          content: message.content.filter((part: any) => part.type !== 'source'),
                        };
                      }),
                    },
                    steps: self.aisdk.v4.steps,
                    usage: baseFinishStep.usage,
                  };
                  // console.log('onFinishPayload', JSON.stringify(onFinishPayload, null, 2));
                } else if (model.version === 'v2') {
                  onFinishPayload = {
                    text: baseFinishStep.text,
                    warnings: baseFinishStep.warnings,
                    finishReason: chunk.payload.stepResult.reason,
                    content: this.aisdk.v5.content,
                    reasoning: this.aisdk.v5.reasoning,
                    sources: this.aisdk.v5.sources,
                    files: this.aisdk.v5.files,
                    steps: this.aisdk.v5.steps,
                  };
                }

                await options?.onFinish?.(onFinishPayload);
              }

              if (options?.rootSpan) {
                options.rootSpan.setAttributes({
                  ...(baseFinishStep?.usage.reasoningTokens
                    ? {
                        'stream.usage.reasoningTokens': baseFinishStep.usage.reasoningTokens,
                      }
                    : {}),

                  ...(baseFinishStep?.usage.totalTokens
                    ? {
                        'stream.usage.totalTokens': baseFinishStep.usage.totalTokens,
                      }
                    : {}),

                  ...(baseFinishStep?.usage.inputTokens
                    ? {
                        'stream.usage.inputTokens': baseFinishStep.usage.inputTokens,
                      }
                    : {}),
                  ...(baseFinishStep?.usage.outputTokens
                    ? {
                        'stream.usage.outputTokens': baseFinishStep.usage.outputTokens,
                      }
                    : {}),
                  ...(baseFinishStep?.usage.cachedInputTokens
                    ? {
                        'stream.usage.cachedInputTokens': baseFinishStep.usage.cachedInputTokens,
                      }
                    : {}),

                  ...(baseFinishStep?.providerMetadata
                    ? { 'stream.response.providerMetadata': JSON.stringify(baseFinishStep?.providerMetadata) }
                    : {}),
                  ...(baseFinishStep?.finishReason
                    ? { 'stream.response.finishReason': baseFinishStep?.finishReason }
                    : {}),
                  ...(options?.experimental_telemetry?.recordOutputs !== false
                    ? { 'stream.response.text': baseFinishStep?.text }
                    : {}),
                  ...(baseFinishStep?.toolCalls && options?.experimental_telemetry?.recordOutputs !== false
                    ? {
                        'stream.response.toolCalls': JSON.stringify(
                          baseFinishStep?.toolCalls?.map(chunk => {
                            return {
                              type: chunk.type,
                              ...chunk.payload,
                            };
                          }),
                        ),
                      }
                    : {}),
                });

                options.rootSpan.end();
              }

              break;
          }
          controller.enqueue(chunk);
        },
      }),
    );

    this.#aisdkv4 = new AISDKV4OutputStream({
      modelOutput: this as MastraModelOutput,
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

  get reasoningText() {
    return this.reasoning;
  }

  get reasoningDetails() {
    return Object.values(this.#bufferedReasoningDetails || {});
  }

  get sources() {
    return this.#bufferedSources;
  }

  get files() {
    return this.#bufferedFiles;
  }

  get steps() {
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
