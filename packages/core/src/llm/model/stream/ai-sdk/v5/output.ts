import { TransformStream } from 'stream/web';
import type { LanguageModelV2StreamPart } from '@ai-sdk/provider-v5';
import {
  createUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
  type UIMessageStreamOptions,
} from 'ai-v5';

import type { DataStreamOptions, DataStreamWriter, LanguageModelV1StreamPart, StreamData } from 'ai';
import type { ChunkType } from '../../../../../stream/types';
import type { MastraModelOutput } from '../../base';
import type { ConsumeStreamOptions } from '../v4/compat';
import { consumeStream, getErrorMessage, getErrorMessageV4, mergeStreams, prepareResponseHeaders } from '../v4/compat';
import { convertFullStreamChunkToAISDKv5 } from './transforms';
import { convertFullStreamChunkToUIMessageStream, getResponseUIMessageId } from './compat';

export class AISDKV5OutputStream {
  #modelOutput: MastraModelOutput;
  #options: { toolCallStreaming?: boolean };

  constructor({ modelOutput, options }: { modelOutput: MastraModelOutput; options: { toolCallStreaming?: boolean } }) {
    this.#modelOutput = modelOutput;
    this.#options = options;
  }

  toTextStreamResponse(init?: ResponseInit): Response {
    return new Response(this.#modelOutput.textStream.pipeThrough(new TextEncoderStream() as any) as any, {
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

  toUIMessageStream<UI_MESSAGE extends UIMessage>({
    generateMessageId,
    originalMessages,
    sendFinish = true,
    sendReasoning = true,
    sendSources = false,
    onError = getErrorMessageV4,
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

  get fullStream() {
    let startEvent: ChunkType | undefined;
    let hasStarted: boolean = false;
    const self = this;
    let stepCounter = 0;
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
              toolCallStreaming: self.#options.toolCallStreaming,
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
            toolCallStreaming: self.#options.toolCallStreaming,
          });

          if (transformedChunk) {
            if (!['start', 'finish', 'finish-step'].includes(transformedChunk.type)) {
              console.log('step counter', stepCounter);
              transformedChunk.id = stepCounter.toString();
            }

            controller.enqueue(transformedChunk);
          }

          if (chunk.type === 'error') {
            controller.terminate();
          }
        },
      }),
    );
  }
}
