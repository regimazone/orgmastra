import { TransformStream, TextEncoderStream, TextDecoderStream } from 'stream/web';
import type { DataStreamOptions, DataStreamWriter, LanguageModelV1StreamPart, StreamData } from 'ai';
import type { ChunkType } from '../../../../../stream/types';
import type { MastraModelOutput } from '../../base';
import { consumeStream, getErrorMessage, getErrorMessageV4, mergeStreams, prepareResponseHeaders } from './compat';
import type { ConsumeStreamOptions } from './compat';
import { convertFullStreamChunkToAISDKv4 } from './transforms';
import { MessageList } from '../../../../../agent/message-list';

export class AISDKV4OutputStream {
  #modelOutput: MastraModelOutput;
  #options: { toolCallStreaming?: boolean };

  constructor({ modelOutput, options }: { modelOutput: MastraModelOutput; options: { toolCallStreaming?: boolean } }) {
    this.#modelOutput = modelOutput;
    this.#options = options;
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.#modelOutput.textStream.pipeThrough(new TextEncoderStream()) as BodyInit, {
      status: init?.status ?? 200,
      headers: prepareResponseHeaders(init?.headers, {
        contentType: 'text/plain; charset=utf-8',
      }),
    });
  }

  toDataStreamResponse({
    headers,
    status,
    statusText,
    data,
    getErrorMessage,
    sendUsage,
    sendReasoning,
    sendSources,
    experimental_sendFinish,
  }: ResponseInit &
    DataStreamOptions & {
      data?: StreamData;
      getErrorMessage?: (error: any) => string;
    } = {}): Response {
    let dataStream = this.toDataStream({
      getErrorMessage,
      sendUsage,
      sendReasoning,
      sendSources,
      experimental_sendFinish,
    }).pipeThrough(new TextEncoderStream() as unknown as TransformStream<LanguageModelV1StreamPart, Uint8Array>);

    if (data) {
      // Type incompatibility between Node.js stream/web and global ReadableStream types
      // These are runtime-compatible but TypeScript sees them as different
      const mergedStream = mergeStreams(
        data.stream as Parameters<typeof mergeStreams>[0],
        dataStream as Parameters<typeof mergeStreams>[1],
      );
      dataStream = mergedStream as typeof dataStream;
    }

    return new Response(dataStream as BodyInit, {
      status,
      statusText,
      headers: prepareResponseHeaders(headers, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }),
    });
  }

  toDataStream({
    sendReasoning = false,
    sendSources = false,
    sendUsage = true,
    experimental_sendFinish = true,
    getErrorMessage = getErrorMessageV4,
  }: {
    sendReasoning?: boolean;
    sendSources?: boolean;
    sendUsage?: boolean;
    experimental_sendFinish?: boolean;
    getErrorMessage?: (error: string) => string;
  } = {}) {
    const self = this;
    return this.#modelOutput.fullStream.pipeThrough(
      new TransformStream<ChunkType, LanguageModelV1StreamPart>({
        transform(chunk, controller) {
          const transformedChunk = convertFullStreamChunkToAISDKv4({
            chunk,
            client: true,
            sendReasoning,
            sendSources,
            sendUsage,
            experimental_sendFinish,
            getErrorMessage: getErrorMessage,
            toolCallStreaming: self.#options.toolCallStreaming,
          });

          if (transformedChunk) {
            controller.enqueue(transformedChunk);
          }
        },
      }),
    );
  }

  mergeIntoDataStream(writer: DataStreamWriter, options?: DataStreamOptions) {
    writer.merge(
      this.toDataStream({
        getErrorMessage: writer.onError,
        sendUsage: options?.sendUsage,
        sendReasoning: options?.sendReasoning,
        sendSources: options?.sendSources,
        experimental_sendFinish: options?.experimental_sendFinish,
      })
        .pipeThrough(new TextEncoderStream() as unknown as TransformStream<LanguageModelV1StreamPart, Uint8Array>)
        .pipeThrough(new TextDecoderStream()) as Parameters<typeof writer.merge>[0],
    );
  }

  async consumeStream(options?: ConsumeStreamOptions): Promise<void> {
    try {
      await consumeStream({
        stream: this.fullStream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk);
            },
          }),
        ) as any,
        onError: options?.onError,
      });
    } catch (error) {
      console.log('consumeStream error', error);
      options?.onError?.(error);
    }
  }

  get fullStream() {
    let startEvent: ChunkType | undefined;
    let hasStarted: boolean = false;
    const self = this;
    return this.#modelOutput.fullStream.pipeThrough(
      new TransformStream<ChunkType, LanguageModelV1StreamPart>({
        transform(chunk, controller) {
          if (chunk.type === 'start') {
            return;
          }

          if (chunk.type === 'step-start' && !startEvent) {
            startEvent = convertFullStreamChunkToAISDKv4({
              chunk,
              client: false,
              sendReasoning: false,
              sendSources: false,
              sendUsage: false,
              getErrorMessage: getErrorMessage,
              toolCallStreaming: self.#options.toolCallStreaming,
            });
            return;
          } else if (chunk.type !== 'error') {
            hasStarted = true;
          }

          if (startEvent && hasStarted) {
            controller.enqueue(startEvent as any);
            startEvent = undefined;
          }

          const transformedChunk = convertFullStreamChunkToAISDKv4({
            chunk,
            client: false,
            sendReasoning: false,
            sendSources: false,
            sendUsage: false,
            getErrorMessage: getErrorMessage,
            toolCallStreaming: self.#options.toolCallStreaming,
          });

          if (transformedChunk) {
            controller.enqueue(transformedChunk);
          }

          if (chunk.type === 'error') {
            controller.terminate();
          }
        },
      }),
    );
  }

  async getFullOutput() {
    await this.consumeStream();
    return {
      text: this.#modelOutput.text,
      usage: this.#modelOutput.usage,
      steps: this.steps,
      finishReason: this.#modelOutput.finishReason,
      reasoning: this.#modelOutput.reasoning,
      warnings: this.#modelOutput.warnings,
      providerMetadata: this.#modelOutput.providerMetadata,
      request: this.#modelOutput.request,
      toolCalls: this.toolCalls,
      toolResults: this.toolResults,
      sources: this.sources,
      files: this.files,
      response: this.response,
    };
  }

  get sources() {
    return this.#modelOutput.sources.map(chunk => {
      return convertFullStreamChunkToAISDKv4({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: true,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
        toolCallStreaming: false,
      }).source;
    });
  }

  get toolCalls() {
    return this.#modelOutput.toolCalls.map(chunk => {
      return convertFullStreamChunkToAISDKv4({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
        toolCallStreaming: false,
      });
    });
  }

  get files() {
    return this.#modelOutput.files.map(chunk => {
      return convertFullStreamChunkToAISDKv4({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
        toolCallStreaming: false,
      });
    });
  }

  get toolResults() {
    return this.#modelOutput.toolResults.map(chunk => {
      return convertFullStreamChunkToAISDKv4({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
        toolCallStreaming: false,
      });
    });
  }

  get steps() {
    return this.#modelOutput.steps.map(step => {
      const messageList = new MessageList();
      messageList.add(step.response.messages, 'response');

      return {
        ...step,
        sources: step.sources.map((source: any) => {
          return convertFullStreamChunkToAISDKv4({
            chunk: source,
            client: false,
            sendReasoning: false,
            sendSources: true,
            sendUsage: false,
            getErrorMessage: (error: string) => error,
          }).source;
        }),
        files: step.files.map((file: any) => {
          return convertFullStreamChunkToAISDKv4({
            chunk: file,
            client: false,
            sendReasoning: false,
            sendSources: false,
            sendUsage: false,
            getErrorMessage: (error: string) => error,
          });
        }),
        toolCalls: step.toolCalls.map((toolCall: any) => {
          return convertFullStreamChunkToAISDKv4({
            chunk: toolCall,
            client: false,
            sendReasoning: false,
            sendSources: false,
            sendUsage: false,
            getErrorMessage: (error: string) => error,
          });
        }),
        toolResults: step.toolResults.map((toolResult: any) => {
          return convertFullStreamChunkToAISDKv4({
            chunk: toolResult,
            client: false,
            sendReasoning: false,
            sendSources: false,
            sendUsage: false,
            getErrorMessage: (error: string) => error,
          });
        }),
        response: {
          ...step.response,
          messages: messageList.get.all.v1().map((message: any) => {
            return {
              id: message.id,
              role: message.role,
              content: message.content.filter((part: any) => part.type !== 'source'),
            };
          }),
        },
      };
    });
  }

  get response() {
    return this.#modelOutput.response;
  }
}
