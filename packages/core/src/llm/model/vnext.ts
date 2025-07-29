import { generateId } from 'ai';
import type { LanguageModel, ToolSet } from 'ai';
import { z } from 'zod';
import { MessageList } from '../../agent/message-list';
import type { ChunkType } from '../../stream/types';
import { createWorkflow, createStep } from '../../workflows';
import { prepareToolsAndToolChoice } from './prepare-tools';
import { AISDKV4InputStream } from './stream/ai-sdk/v4';
import { MastraModelOutput } from './stream/base';

export class AgenticLoop {
  stepCount = 0;

  toMessageList(messages: any[]) {
    const messageList = new MessageList();

    for (const message of messages) {
      let role;

      if (message.role === 'system') {
        messageList.addSystem(message.content);
        continue;
      }

      if (message.role === 'user') {
        role = 'user';
      } else {
        role = 'response';
      }

      messageList.add(message, role);
    }

    return messageList;
  }

  createToolCallStep({ tools }: { tools?: ToolSet }) {
    return createStep({
      id: 'toolCallStep',
      inputSchema: z.any(),
      outputSchema: z.any(),
      execute: async ({ inputData, getStepResult }) => {
        console.log('Tool call step');

        console.log(JSON.stringify(inputData, null, 2));

        console.log(Object.values(tools || {}));

        const tool =
          tools?.[inputData.toolName] || Object.values(tools || {})?.find(tool => tool.name === inputData.toolName);

        if (!tool) {
          throw new Error(`Tool ${inputData.toolName} not found`);
        }

        if (!tool.execute) {
          return inputData;
        }

        const initialResult = getStepResult({
          id: 'generateText',
        } as any);

        const messageList = this.toMessageList(initialResult.userMessages);

        const result = await tool.execute(inputData.args, {
          toolCallId: inputData.toolCallId,
          messages: messageList.get.all
            .ui()
            .filter(message => message.role === 'user')
            .map(message => ({
              role: message.role,
              content: message.content,
            })) as any,
        });

        return { result, ...inputData };
      },
    });
  }

  createLLMStep({
    controller,
    model,
    tools,
    toolChoice,
    providerMetadata,
    runId,
    messageId,
    _internal,
    toolCallStreaming,
    experimental_generateMessageId,
    onChunk,
  }: {
    controller: ReadableStreamDefaultController<any>;
    model: LanguageModel;
    tools?: ToolSet;
    toolChoice?: string;
    providerMetadata?: Record<string, any>;
    runId: string;
    messageId?: string;
    experimental_generateMessageId?: () => string;
    responseId?: string;
    _internal: {
      currentDate: () => Date;
      now: () => number;
      generateId: () => string;
    };
    toolCallStreaming?: boolean;
  }) {
    return createStep({
      id: 'generateText',
      inputSchema: z.any(),
      outputSchema: z.any(),
      execute: async ({ inputData }) => {
        this.stepCount++;

        console.log('inputData FOR LLM', JSON.stringify(inputData.messages, null, 2));

        const messageList = this.toMessageList(inputData.messages || []);

        console.log('messageList FOR LLM', JSON.stringify(messageList.get.all.core(), null, 2));

        let stream;
        let warnings;
        let request = {};
        let rawResponse: any;

        if (model.specificationVersion === 'v1') {
          const v4 = new AISDKV4InputStream({
            component: 'LLM',
            name: model.modelId,
          });

          stream = v4.initialize({
            runId,
            createStream: async () => {
              try {
                const stream = await model.doStream({
                  inputFormat: 'messages',
                  mode: {
                    type: 'regular',
                    ...prepareToolsAndToolChoice({
                      tools,
                      toolChoice: toolChoice as any,
                      activeTools: Object.keys(tools || {}),
                    }),
                  },
                  providerMetadata,
                  prompt: messageList.get.all.core() as any,
                });

                warnings = stream.warnings;
                request = stream.request || {};
                rawResponse = stream.rawResponse;

                return stream.stream as any;
              } catch (error) {
                console.error('DO STREAM ERROR', error);
                return new ReadableStream({
                  start: async controller => {
                    controller.enqueue({
                      type: 'error',
                      error,
                    });
                    controller.close();
                  },
                });
              }
            },
          });
        }

        const outputStream = new MastraModelOutput({
          stream: stream!,
          options: {
            toolCallStreaming: toolCallStreaming,
          },
        });

        const defaultResponseMetadata = {
          id: _internal?.generateId?.(),
          timestamp: _internal?.currentDate?.(),
          modelId: model.modelId,
          headers: undefined,
        };

        let responseMetadata: Record<string, any> | undefined = undefined;

        let stepFinishPayload;

        let hasErrored = false;

        let text;
        let toolCalls: any[] = [];
        let finishReason;
        let usage;
        let hasToolCallStreaming = false;

        let reasoningDeltas: any[] = [];

        await controller.enqueue({
          type: 'step-start',
          payload: {
            request: request,
            warnings: [],
            messageId: messageId,
          },
        });

        try {
          for await (const chunk of outputStream.fullStream) {
            switch (chunk.type) {
              case 'error':
                hasErrored = true;
                await controller.enqueue(chunk);
                stepFinishPayload = {
                  isContinued: false,
                  reason: 'error',
                  totalUsage: {
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                  },
                };
                break;
              case 'response-metadata':
                responseMetadata = {
                  id: chunk.payload.id,
                  timestamp: chunk.payload.timestamp,
                  modelId: chunk.payload.modelId,
                  headers: chunk.payload.headers,
                };
                break;
              case 'finish':
                providerMetadata = chunk.payload.providerMetadata;
                stepFinishPayload = {
                  reason: chunk.payload.reason,
                  logprobs: chunk.payload.logprobs,
                  warnings: warnings,
                  totalUsage: {
                    promptTokens: chunk.payload.totalUsage.promptTokens,
                    completionTokens: chunk.payload.totalUsage.completionTokens,
                    totalTokens:
                      chunk.payload.totalUsage.totalTokens ||
                      chunk.payload.totalUsage.promptTokens + chunk.payload.totalUsage.completionTokens,
                  },
                  response: {
                    ...(responseMetadata || defaultResponseMetadata),
                    headers: rawResponse?.headers,
                    messages: [],
                  },
                  messageId,
                  isContinued: !['stop', 'error'].includes(chunk.payload.reason),
                  experimental_providerMetadata: chunk.payload.providerMetadata,
                  providerMetadata: chunk.payload.providerMetadata,
                  request,
                };
                break;
              case 'reasoning':
                reasoningDeltas.push(chunk.payload.text);
                await controller.enqueue(chunk);
                break;
              case 'reasoning-signature':
                if (reasoningDeltas.length) {
                  messageList.add(
                    {
                      id: messageId,
                      role: 'assistant',
                      content: [
                        { type: 'reasoning', text: reasoningDeltas.join(''), signature: chunk.payload.signature },
                      ],
                    },
                    'response',
                  );
                  reasoningDeltas = [];
                }

                await controller.enqueue(chunk);
                break;
              case 'redacted-reasoning':
                messageList.add(
                  {
                    id: messageId,
                    role: 'assistant',
                    content: [{ type: 'redacted-reasoning', data: chunk.payload.data }],
                  },
                  'response',
                );
                await controller.enqueue(chunk);
                break;
              case 'tool-call-delta':
                if (!hasToolCallStreaming) {
                  await controller.enqueue({
                    type: 'tool-call-streaming-start',
                    from: 'AGENT',
                    runId: chunk.runId,
                    payload: {
                      toolCallId: chunk.payload.toolCallId,
                      toolName: chunk.payload.toolName,
                    },
                  });
                  onChunk?.({
                    type: 'tool-call-streaming-start',
                    from: 'AGENT',
                    runId: chunk.runId,
                    payload: {
                      toolCallId: chunk.payload.toolCallId,
                      toolName: chunk.payload.toolName,
                    },
                  });
                  hasToolCallStreaming = true;
                }
                await controller.enqueue(chunk);
                break;
              case 'file':
                messageList.add(
                  {
                    id: messageId,
                    role: 'assistant',
                    content: [
                      {
                        type: 'file',
                        data: chunk.payload.data,
                        mimeType: chunk.payload.mimeType,
                      },
                    ],
                  },
                  'response',
                );
                await controller.enqueue(chunk);
                break;
              default:
                await controller.enqueue(chunk);
            }

            if (['text-delta', 'reasoning', 'source', 'tool-call', 'tool-call-delta'].includes(chunk.type)) {
              onChunk?.(chunk);
            }

            if (hasErrored) {
              break;
            }
          }

          text = outputStream.text;
          toolCalls = outputStream.toolCalls;
          finishReason = outputStream.finishReason;
          usage = outputStream.usage;
        } catch {
          hasErrored = true;
          text = '';
          toolCalls = [];
          finishReason = 'error';
          usage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          };
          stepFinishPayload = {
            isContinued: false,
            reason: 'error',
            totalUsage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        }

        if (toolCalls.length > 0) {
          const userContent = [] as any[];

          if (text) {
            userContent.push({
              type: 'text',
              text: text,
            });
          }

          const assistantContent = [
            ...userContent,
            ...(toolCalls.map(toolCall => {
              return {
                type: 'tool-call',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.args,
              };
            }) as any),
          ];

          messageList.add(
            {
              id: messageId,
              role: 'assistant',
              content: assistantContent,
            },
            'response',
          );
        } else {
          if (text) {
            messageList.add(
              {
                id: messageId,
                role: 'assistant',
                content: [{ type: 'text', text }],
              },
              'response',
            );
          }
        }

        const allMessages = messageList.get.all.v1().map(message => {
          return {
            id: message.id,
            role: message.role,
            content: message.content,
          };
        });
        const userMessages = allMessages.filter(message => message.role === 'user');
        const nonUserMessages = allMessages.filter(message => message.role !== 'user');

        if (stepFinishPayload && stepFinishPayload.response) {
          stepFinishPayload.response.messages = nonUserMessages as any;
        }

        return {
          response: {
            headers: rawResponse?.headers,
            warnings,
            stepFinishPayload,
            reason: hasErrored ? 'error' : finishReason,
            text,
            toolCalls,
            usage: {
              promptTokens: usage.promptTokens + (inputData.response?.usage?.promptTokens || 0),
              completionTokens: usage.completionTokens + (inputData.response?.usage?.completionTokens || 0),
              totalTokens: usage.promptTokens + usage.completionTokens + (inputData.response?.usage?.totalTokens || 0),
            },
            providerMetadata: providerMetadata,
            metadata: responseMetadata || defaultResponseMetadata,
          },
          userMessages: userMessages,
          messages: nonUserMessages,
        };
      },
    });
  }

  createExecutionWorkflow({
    controller,
    model,
    tools,
    toolChoice,
    providerMetadata,
    runId,
    experimental_generateMessageId,
    _internal,
    toolCallStreaming,
    onChunk,
  }: {
    controller: ReadableStreamDefaultController<any>;
    model: LanguageModel;
    tools?: ToolSet;
    toolChoice?: string;
    providerMetadata?: Record<string, any>;
    runId: string;
    responseId?: string;
    experimental_generateMessageId?: () => string;
    _internal: {
      currentDate: () => Date;
      now: () => number;
      generateId: () => string;
    };
    toolCallStreaming?: boolean;
    onChunk?: (chunk: ChunkType) => void;
  }) {
    const messageId = experimental_generateMessageId?.() || _internal.generateId?.();

    const llmStep = this.createLLMStep({
      controller,
      model,
      tools,
      toolChoice,
      providerMetadata,
      runId,
      messageId,
      _internal,
      toolCallStreaming,
      onChunk,
    });

    const toolCallStep = this.createToolCallStep({ tools });

    return createWorkflow({
      id: 'executionWorkflow',
      inputSchema: z.any(),
      outputSchema: z.any(),
    })
      .then(llmStep)
      .map(({ inputData }) => {
        return inputData.response.toolCalls || [];
      })
      .foreach(toolCallStep)
      .map(async ({ getStepResult, inputData, bail }) => {
        const initialResult = getStepResult(llmStep);

        console.log('stepFinishPayload', initialResult.response.stepFinishPayload);

        const messageList = this.toMessageList(initialResult.messages || []);

        if (inputData?.every(toolCall => toolCall?.result === undefined)) {
          await controller.enqueue({
            type: 'step-finish',
            payload: initialResult.response.stepFinishPayload,
          });

          return bail(initialResult);
        }

        if (inputData?.length) {
          for (const toolCall of inputData) {
            const chunk = {
              type: 'tool-result',
              runId: runId,
              from: 'AGENT',
              payload: {
                args: toolCall.args,
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                result: toolCall.result,
              },
            };

            await controller.enqueue(chunk);

            onChunk?.(chunk);
          }

          messageList.add(
            {
              role: 'tool',
              content: inputData.map(toolCall => {
                return {
                  type: 'tool-result',
                  args: toolCall.args,
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  result: toolCall.result,
                };
              }),
            },
            'response',
          );
        }

        await controller.enqueue({
          type: 'step-finish',
          payload: initialResult.response.stepFinishPayload,
        });

        return {
          ...initialResult,
          messages: messageList.get.all.core(),
        };
      })
      .commit();
  }

  async loop({
    runId,
    model,
    tools,
    toolChoice,
    system,
    prompt,
    threadId,
    resourceId,
    maxSteps = 5,
    maxRetries = 3,
    providerMetadata,
    toolCallStreaming,
    onChunk,
    experimental_generateMessageId,
    _internal = {
      currentDate: () => new Date(),
      now: () => Date.now(),
      generateId,
    },
  }: {
    runId?: string;
    model: LanguageModel;
    tools?: ToolSet;
    toolChoice?: string;
    system?: string;
    prompt: string;
    threadId?: string;
    resourceId?: string;
    maxSteps?: number;
    maxRetries?: number;
    toolCallStreaming?: boolean;
    providerMetadata?: Record<string, any>;
    onChunk?: (chunk: ChunkType) => void;
    experimental_generateMessageId?: () => string;
    _internal?: {
      currentDate?: () => Date;
      now?: () => number;
      generateId?: () => string;
    };
  }) {
    const messageList = new MessageList({
      threadId,
      resourceId,
    });

    if (system) {
      messageList.addSystem(system);
    }

    if (prompt) {
      messageList.add(prompt, 'user');
    }

    const messages = messageList.get.all.core();

    if (!runId) {
      runId = crypto.randomUUID();
    }

    // We call this for no reason because of aisdk
    _internal.generateId?.();

    const readableStream = new ReadableStream({
      start: async controller => {
        const executionWorkflow = this.createExecutionWorkflow({
          controller,
          model,
          tools: tools || undefined,
          toolChoice: toolChoice,
          providerMetadata: providerMetadata,
          runId,
          experimental_generateMessageId,
          _internal,
          toolCallStreaming,
          onChunk,
        });

        const mainWorkflow = createWorkflow({
          id: 'agentic-loop',
          inputSchema: z.any(),
          outputSchema: z.any(),
          retryConfig: {
            attempts: maxRetries,
          },
        })
          .dowhile(executionWorkflow, async ({ inputData }) => {
            return !['stop', 'error'].includes(inputData.response.reason) && this.stepCount < maxSteps;
          })
          .map(({ inputData }) => {
            const toolCalls = inputData.messages.filter(message => message.role === 'tool');

            inputData.response.toolCalls = toolCalls;

            return inputData;
          })

          .commit();

        const run = await mainWorkflow.createRunAsync({
          runId,
        });

        console.log('TRIGGER DATA MESSAGES', messages);

        const executionResult = await run.start({
          inputData: {
            messages,
          },
        });

        console.log('executionResult', executionResult);

        if (executionResult.status !== 'success') {
          controller.close();
          return;
        }

        // if (executionResult.result.response.finishReason === 'error') {
        //   throw new Error('Error in execution');
        // }

        const finishPayload = {
          logprobs: executionResult.result.response.logprobs,
          totalUsage: executionResult.result.response.usage,
          reason: executionResult.result.response.reason,
          response: {
            ...executionResult.result?.response?.metadata,
            headers: executionResult.result?.response?.headers,
          },
          providerMetadata: executionResult.result?.response?.providerMetadata,
          experimental_providerMetadata: executionResult.result?.response?.providerMetadata,
          messages: executionResult.result?.messages,
        };

        console.log('finishPayload', JSON.stringify(finishPayload, null, 2));

        await controller.enqueue({
          type: 'finish',
          payload: finishPayload,
        });

        // if (executionResult.result.response.finishReason === 'error') {
        //   controller.error();
        //   return;
        // }

        controller.close();
      },
    });

    return new MastraModelOutput({
      stream: readableStream as any,
      options: {
        toolCallStreaming: toolCallStreaming,
      },
    });
  }
}
