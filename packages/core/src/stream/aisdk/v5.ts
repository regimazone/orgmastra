import { TransformStream } from 'stream/web';
import type { ReadableStream } from 'stream/web';
import { BaseModelStream, MastraModelOutput } from '../base';
import type { ChunkType } from '../types';
import type { RegisteredLogger } from '../../logger';
import {
  consumeStream,
  getErrorMessage,
  getErrorMessageV5,
  mergeStreams,
  prepareResponseHeaders,
  type ConsumeStreamOptions,
} from '../compat';
import {
  formatDataStreamPart,
  StreamData,
  type DataStreamOptions,
  type DataStreamWriter,
} from 'ai';
import { DefaultGeneratedFileWithType } from '../generated-file';

// AI SDK v5 specific types
interface UIMessage<TMetadata = Record<string, any>, TData = any, TTools = Record<string, any>> {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts?: Array<UIMessagePart<TData, TTools>>;
  metadata?: TMetadata;
  createdAt?: Date;
}

interface UIMessagePart<TData = any, TTools = Record<string, any>> {
  type: string;
  text?: string;
  data?: TData;
  toolCallId?: string;
  toolName?: string;
  args?: any;
  result?: any;
  reasoning?: string;
  sources?: Source[];
  annotations?: any[];
}

interface Source {
  type: 'source';
  sourceType: 'url' | 'file' | 'document';
  id: string;
  url?: string;
  title?: string;
  content?: string;
}

// Convert Mastra stream chunks to AI SDK v5 UIMessage format
function convertFullStreamChunkToMastra(value: any, ctx: { runId: string }) {
  if (value.type === 'step-start') {
    return {
      type: 'step-start',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        messageId: value.messageId,
        request: { body: JSON.parse(value.request!.body ?? '{}') },
        warnings: value.warnings,
      },
    };
  } else if (value.type === 'tool-call') {
    return {
      type: 'tool-call',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        toolCallId: value.toolCallId,
        args: value.args,
        toolName: value.toolName,
      },
    };
  } else if (value.type === 'tool-result') {
    return {
      type: 'tool-result',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        toolCallId: value.toolCallId,
        result: value.result,
      },
    };
  } else if (value.type === 'text-delta') {
    return {
      type: 'text-delta',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        text: value.textDelta || value.payload?.text,
      },
    };
  } else if (value.type === 'reasoning-delta') {
    return {
      type: 'reasoning-delta',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        reasoning: value.reasoning || value.payload?.reasoning,
      },
    };
  } else if (value.type === 'source') {
    return {
      type: 'source',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value.source || value.payload,
    };
  } else if (value.type === 'finish') {
    return {
      type: 'finish',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        finishReason: value.finishReason,
        usage: value.usage,
      },
    };
  } else if (value.type === 'error') {
    return {
      type: 'error',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        error: value.error,
      },
    };
  }

  return null;
}

export class AISDKV5InputStream extends BaseModelStream {
  constructor({ component, name }: { component: RegisteredLogger; name: string }) {
    super({ component, name });
  }

  async transform({
    runId,
    stream,
    controller,
  }: {
    runId: string;
    stream: ReadableStream<any>;
    controller: ReadableStreamDefaultController<ChunkType>;
  }) {
    for await (const chunk of stream) {
      const transformedChunk = convertFullStreamChunkToMastra(chunk, { runId });
      if (transformedChunk) {
        controller.enqueue(transformedChunk);
      }
    }
  }
}

// Convert Mastra chunks to AI SDK v5 format with SSE support
function convertFullStreamChunkToAISDKv5({
  chunk,
  client,
  sendReasoning,
  sendSources,
  sendUsage = true,
  sendMetadata = true,
  toolCallArgsDeltas,
  toolCallStreaming,
  getErrorMessage,
}: {
  chunk: any;
  client: boolean;
  sendReasoning: boolean;
  sendSources: boolean;
  sendUsage: boolean;
  sendMetadata?: boolean;
  toolCallArgsDeltas?: Record<string, string[]>;
  toolCallStreaming?: boolean;
  getErrorMessage: (error: string) => string;
}) {
  console.log('convertFullStreamChunkToAISDKv5 toolCallStreaming', toolCallStreaming);
  console.log('chunk', chunk);

  if (chunk.type === 'text-delta') {
    if (client) {
      // Server-Sent Events format for v5
      return `data: ${JSON.stringify({
        type: 'text-delta',
        delta: { content: chunk.payload.text }
      })}\n\n`;
    }
    return {
      type: 'text-delta',
      delta: { content: chunk.payload.text },
    };
  } else if (chunk.type === 'reasoning-delta') {
    if (!sendReasoning) return null;
    
    if (client) {
      return `data: ${JSON.stringify({
        type: 'reasoning-delta',
        delta: { reasoning: chunk.payload.reasoning }
      })}\n\n`;
    }
    return {
      type: 'reasoning-delta',
      delta: { reasoning: chunk.payload.reasoning },
    };
  } else if (chunk.type === 'source') {
    if (!sendSources) return null;
    
    if (client) {
      return `data: ${JSON.stringify({
        type: 'source',
        source: chunk.payload
      })}\n\n`;
    }
    return {
      type: 'source',
      source: chunk.payload,
    };
  } else if (chunk.type === 'step-start') {
    if (client) {
      return `data: ${JSON.stringify({
        type: 'step-start',
        messageId: chunk.payload.messageId,
      })}\n\n`;
    }
    return {
      type: 'step-start',
      messageId: chunk.payload.messageId,
    };
  } else if (chunk.type === 'step-finish') {
    if (client) {
      if (!chunk.payload) {
        return;
      }
      const finishData: any = {
        type: 'step-finish',
        finishReason: chunk.payload.finishReason,
        isContinued: chunk.payload.isContinued ?? false,
      };
      
      if (sendUsage && chunk.payload.usage) {
        finishData.usage = chunk.payload.usage;
      }
      
      return `data: ${JSON.stringify(finishData)}\n\n`;
    }
    return {
      type: 'step-finish',
      finishReason: chunk.payload.finishReason,
      usage: chunk.payload.usage,
      isContinued: chunk.payload.isContinued ?? false,
    };
  } else if (chunk.type === 'tool-call') {
    if (client) {
      return `data: ${JSON.stringify({
        type: 'tool-call',
        toolCallId: chunk.payload.toolCallId,
        toolName: chunk.payload.toolName,
        args: chunk.payload.args,
      })}\n\n`;
    }
    return {
      type: 'tool-call',
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
      args: chunk.payload.args,
    };
  } else if (chunk.type === 'tool-result') {
    if (client) {
      return `data: ${JSON.stringify({
        type: 'tool-result',
        toolCallId: chunk.payload.toolCallId,
        result: chunk.payload.result,
      })}\n\n`;
    }
    return {
      type: 'tool-result',
      toolCallId: chunk.payload.toolCallId,
      result: chunk.payload.result,
    };
  } else if (chunk.type === 'finish') {
    if (client) {
      const finishData: any = {
        type: 'finish',
        finishReason: chunk.payload.finishReason,
      };
      
      if (sendUsage && chunk.payload.usage) {
        finishData.usage = chunk.payload.usage;
      }
      
      return `data: ${JSON.stringify(finishData)}\n\n`;
    }
    return {
      type: 'finish',
      finishReason: chunk.payload.finishReason,
      usage: chunk.payload.usage,
    };
  } else if (chunk.type === 'error') {
    const errorMessage = getErrorMessage(chunk.payload.error);
    if (client) {
      return `data: ${JSON.stringify({
        type: 'error',
        error: errorMessage,
      })}\n\n`;
    }
    return {
      type: 'error',
      error: errorMessage,
    };
  } else if (chunk.type === 'metadata' && sendMetadata) {
    if (client) {
      return `data: ${JSON.stringify({
        type: 'metadata',
        metadata: chunk.payload,
      })}\n\n`;
    }
    return {
      type: 'metadata',
      metadata: chunk.payload,
    };
  }

  return null;
}

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

  toUIMessageStreamResponse({
    headers,
    status,
    statusText,
    data,
    getErrorMessage,
    sendUsage,
    sendReasoning,
    sendSources,
    sendMetadata,
    messageMetadata,
  }: ResponseInit & {
    data?: StreamData;
    getErrorMessage?: (error: unknown) => string;
    sendUsage?: boolean;
    sendReasoning?: boolean;
    sendSources?: boolean;
    sendMetadata?: boolean;
    messageMetadata?: (part: any) => any;
  } = {}): Response {
    let dataStream = this.toUIMessageStream({
      getErrorMessage,
      sendUsage,
      sendReasoning,
      sendSources,
      sendMetadata,
      messageMetadata,
    }).pipeThrough(new TextEncoderStream() as any) as any;

    if (data) {
      dataStream = mergeStreams(data.stream, dataStream);
    }

    return new Response(dataStream, {
      status,
      statusText,
      headers: prepareResponseHeaders(headers, {
        contentType: 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      }),
    });
  }

  toUIMessageStream({
    sendReasoning = false,
    sendSources = false,
    sendUsage = true,
    sendMetadata = true,
    getErrorMessage = getErrorMessageV5,
    messageMetadata,
  }: {
    sendReasoning?: boolean;
    sendSources?: boolean;
    sendUsage?: boolean;
    sendMetadata?: boolean;
    getErrorMessage?: (error: string) => string;
    messageMetadata?: (part: any) => any;
  } = {}) {
    const self = this;
    console.log('toUIMessageStream toolCallStreaming', self.#options.toolCallStreaming);
    
    return this.#modelOutput.fullStream.pipeThrough(
      new TransformStream<ChunkType, string>({
        transform(chunk, controller) {
          const transformedChunk = convertFullStreamChunkToAISDKv5({
            chunk,
            client: true,
            sendReasoning,
            sendSources,
            sendUsage,
            sendMetadata,
            toolCallStreaming: self.#options.toolCallStreaming,
            getErrorMessage,
          });

          if (transformedChunk) {
            // Add metadata if provided
            if (messageMetadata && typeof transformedChunk === 'string') {
              try {
                const parsed = JSON.parse(transformedChunk.replace('data: ', '').trim());
                const metadata = messageMetadata(parsed);
                if (metadata) {
                  parsed.metadata = metadata;
                  controller.enqueue(`data: ${JSON.stringify(parsed)}\n\n`);
                  return;
                }
              } catch (error) {
                console.warn('Failed to add metadata to chunk:', error);
              }
            }
            
            controller.enqueue(transformedChunk);
          }
        },
        flush(controller) {
          // Send final SSE close
          controller.enqueue('data: [DONE]\n\n');
        },
      }),
    );
  }

  toDataStream({
    sendReasoning = false,
    sendSources = false,
    sendUsage = true,
    sendMetadata = true,
    getErrorMessage = getErrorMessageV5,
  }: {
    sendReasoning?: boolean;
    sendSources?: boolean;
    sendUsage?: boolean;
    sendMetadata?: boolean;
    getErrorMessage?: (error: string) => string;
  } = {}) {
    const self = this;
    console.log('toDataStream toolCallStreaming', self.#options.toolCallStreaming);
    
    return this.#modelOutput.fullStream.pipeThrough(
      new TransformStream<ChunkType, any>({
        transform(chunk, controller) {
          const transformedChunk = convertFullStreamChunkToAISDKv5({
            chunk,
            client: false,
            sendReasoning,
            sendSources,
            sendUsage,
            sendMetadata,
            toolCallStreaming: self.#options.toolCallStreaming,
            getErrorMessage,
          });

          if (transformedChunk) {
            controller.enqueue(transformedChunk);
          }
        },
      }),
    );
  }

  async consumeStream(options?: ConsumeStreamOptions) {
    const warnings: any[] = [];
    const errors: any[] = [];
    const messages: UIMessage[] = [];
    const metadata: any[] = [];
    let currentMessage: Partial<UIMessage> = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      parts: [],
      createdAt: new Date(),
    };

    try {
      for await (const chunk of this.#modelOutput.fullStream) {
        if (chunk.type === 'text-delta') {
          if (!currentMessage.content) {
            currentMessage.content = '';
          }
          currentMessage.content += chunk.payload.text;
          
          // Add text part
          currentMessage.parts = currentMessage.parts || [];
          const existingTextPart = currentMessage.parts.find(p => p.type === 'text');
          if (existingTextPart) {
            existingTextPart.text = currentMessage.content;
          } else {
            currentMessage.parts.push({
              type: 'text',
              text: currentMessage.content,
            });
          }
        } else if (chunk.type === 'reasoning-delta') {
          currentMessage.parts = currentMessage.parts || [];
          const existingReasoningPart = currentMessage.parts.find(p => p.type === 'reasoning');
          if (existingReasoningPart) {
            existingReasoningPart.reasoning = (existingReasoningPart.reasoning || '') + chunk.payload.reasoning;
          } else {
            currentMessage.parts.push({
              type: 'reasoning',
              reasoning: chunk.payload.reasoning,
            });
          }
        } else if (chunk.type === 'source') {
          currentMessage.parts = currentMessage.parts || [];
          currentMessage.parts.push({
            type: 'source',
            sources: [chunk.payload],
          });
        } else if (chunk.type === 'tool-call') {
          currentMessage.parts = currentMessage.parts || [];
          currentMessage.parts.push({
            type: `tool-${chunk.payload.toolName}`,
            toolCallId: chunk.payload.toolCallId,
            toolName: chunk.payload.toolName,
            args: chunk.payload.args,
          });
        } else if (chunk.type === 'tool-result') {
          currentMessage.parts = currentMessage.parts || [];
          const toolPart = currentMessage.parts.find(
            p => p.toolCallId === chunk.payload.toolCallId
          );
          if (toolPart) {
            toolPart.result = chunk.payload.result;
          }
        } else if (chunk.type === 'metadata') {
          metadata.push(chunk.payload);
          if (currentMessage.metadata) {
            Object.assign(currentMessage.metadata, chunk.payload);
          } else {
            currentMessage.metadata = { ...chunk.payload };
          }
        } else if (chunk.type === 'error') {
          errors.push(chunk.payload.error);
        } else if (chunk.type === 'finish') {
          // Finalize current message
          messages.push(currentMessage as UIMessage);
          break;
        }
      }

      return {
        messages,
        metadata,
        warnings,
        errors,
      };
    } catch (error) {
      errors.push(error);
      if (options?.onError) {
        await options.onError(error);
      }
      throw error;
    }
  }

  get fullStream() {
    return this.#modelOutput.fullStream;
  }
}

// Export utility functions for v5 compatibility
export function getErrorMessageV5(error: string): string {
  return getErrorMessage(error);
}

export { convertFullStreamChunkToAISDKv5 };