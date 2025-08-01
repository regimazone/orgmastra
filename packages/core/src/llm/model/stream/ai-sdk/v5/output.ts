import { TransformStream } from 'stream/web';
import { createTextStreamResponse, createUIMessageStream, createUIMessageStreamResponse } from 'ai-v5';
import type { TextStreamPart, ToolSet, UIMessage, UIMessageChunk, UIMessageStreamOptions } from 'ai-v5';

import type { DataStreamOptions, DataStreamWriter, StreamData } from 'ai';
import type { ChunkType } from '../../../../../stream/types';
import type { MastraModelOutput } from '../../base';
import type { ConsumeStreamOptions } from '../v4/compat';
import { consumeStream, getErrorMessage, mergeStreams, prepareResponseHeaders } from '../v4/compat';
import { convertFullStreamChunkToUIMessageStream, getErrorMessageV5, getResponseUIMessageId } from './compat';
import { convertFullStreamChunkToAISDKv5 } from './transforms';

export class AISDKV5OutputStream {
  #modelOutput: MastraModelOutput;
  #options: { toolCallStreaming?: boolean };

  constructor({ modelOutput, options }: { modelOutput: MastraModelOutput; options: { toolCallStreaming?: boolean } }) {
    this.#modelOutput = modelOutput;
    this.#options = options;
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return createTextStreamResponse({
      textStream: this.#modelOutput.textStream as any,
      ...init,
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
    }).pipeThrough(new TextEncoderStream() as any) as any;

    if (data) {
      dataStream = mergeStreams(data.stream as any, dataStream);
    }

    return new Response(dataStream, {
      status,
      statusText,
      headers: prepareResponseHeaders(headers, {
        contentType: 'text/plain; charset=utf-8',
        dataStreamVersion: 'v1',
      }),
    });
  }

  toUIMessageStreamResponse<UI_MESSAGE extends UIMessage>({
    generateMessageId,
    originalMessages,
    sendFinish,
    sendReasoning,
    sendSources,
    onError,
    sendStart,
    messageMetadata,
    onFinish,
    ...init
  }: UIMessageStreamOptions<UI_MESSAGE> & ResponseInit = {}) {
    return createUIMessageStreamResponse({
      stream: this.toUIMessageStream({
        generateMessageId,
        originalMessages,
        sendFinish,
        sendReasoning,
        sendSources,
        onError,
        sendStart,
        messageMetadata,
        onFinish,
      }),
      ...init,
    });
  }

  toUIMessageStream<UI_MESSAGE extends UIMessage>({
    generateMessageId,
    originalMessages,
    sendFinish = true,
    sendReasoning = true,
    sendSources = false,
    onError = getErrorMessageV5,
    sendStart = true,
    messageMetadata,
    onFinish,
  }: UIMessageStreamOptions<UI_MESSAGE> = {}) {
    const responseMessageId =
      generateMessageId != null
        ? getResponseUIMessageId({
            originalMessages,
            responseMessageId: generateMessageId,
          })
        : undefined;

    return createUIMessageStream({
      onError,
      onFinish,
      generateId: () => responseMessageId ?? generateMessageId?.(),
      execute: async ({ writer }) => {
        for await (const part of this.fullStream) {
          const messageMetadataValue = messageMetadata?.({ part });

          const partType = part.type;

          const transformedChunk = convertFullStreamChunkToUIMessageStream({
            part,
            sendReasoning,
            messageMetadataValue,
            sendSources,
            sendStart,
            sendFinish,
            responseMessageId,
            onError,
          });

          if (transformedChunk) {
            writer.write(transformedChunk as UIMessageChunk<any, any>);
          }

          // start and finish events already have metadata
          // so we only need to send metadata for other parts
          if (messageMetadataValue != null && partType !== 'start' && partType !== 'finish') {
            writer.write({
              type: 'message-metadata',
              messageMetadata: messageMetadataValue,
            });
          }
        }
      },
    });
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
        .pipeThrough(new TextEncoderStream() as any)
        .pipeThrough(new TextDecoderStream() as any) as any,
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

  get sources() {
    return this.#modelOutput.sources.map(source => {
      return convertFullStreamChunkToAISDKv5({
        chunk: source,
        sendReasoning: false,
        sendSources: true,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
      });
    });
  }

  get files() {
    return this.#modelOutput.files.map(file => {
      return convertFullStreamChunkToAISDKv5({
        chunk: file,
        sendReasoning: false,
        sendSources: false,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
      })?.file;
    });
  }

  get toolCalls() {
    return this.#modelOutput.toolCalls.map(toolCall => {
      return convertFullStreamChunkToAISDKv5({
        chunk: toolCall,
        sendReasoning: false,
        sendSources: false,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
      });
    });
  }

  get toolResults() {
    return this.#modelOutput.toolResults.map(toolResult => {
      return convertFullStreamChunkToAISDKv5({
        chunk: toolResult,
        sendReasoning: false,
        sendSources: false,
        sendUsage: false,
        getErrorMessage: getErrorMessage,
      });
    });
  }

  get reasoningText() {
    return this.#modelOutput.reasoningText;
  }

  get reasoning() {
    return this.#modelOutput.reasoningDetails;
  }

  get response() {
    return this.#modelOutput.response;
  }

  get fullStream() {
    let startEvent: ChunkType | undefined;
    let hasStarted: boolean = false;
    const self = this;
    let stepCounter = 1;
    return this.#modelOutput.fullStream.pipeThrough(
      new TransformStream<ChunkType, TextStreamPart<ToolSet>>({
        transform(chunk, controller) {
          if (chunk.type === 'step-start' && !startEvent) {
            startEvent = convertFullStreamChunkToAISDKv5({
              chunk,
              sendReasoning: false,
              sendSources: false,
              sendUsage: false,
              getErrorMessage: getErrorMessage,
            });
            stepCounter++;
            return;
          } else if (chunk.type !== 'error') {
            hasStarted = true;
          }

          if (startEvent && hasStarted) {
            controller.enqueue(startEvent as any);
            startEvent = undefined;
          }

          const transformedChunk = convertFullStreamChunkToAISDKv5({
            chunk,
            sendReasoning: false,
            sendSources: false,
            sendUsage: false,
            getErrorMessage: getErrorMessage,
          });

          if (transformedChunk) {
            // if (!['start', 'finish', 'finish-step'].includes(transformedChunk.type)) {
            //   console.log('step counter', stepCounter);
            //   transformedChunk.id = transformedChunk.id ?? stepCounter.toString();
            // }

            controller.enqueue(transformedChunk);
          }
        },
      }),
    );
  }
}
