import type { LanguageModelV1FunctionTool, LanguageModelV1ToolChoice } from '@ai-sdk/provider';
import { generateId, type LanguageModel } from 'ai';
import { z } from 'zod';
import { MessageList } from '../../agent/message-list';
import { MastraAgentStream } from '../../stream/MastraAgentStream';
import { createWorkflow, createStep } from '../../workflows';

type Tool = LanguageModelV1FunctionTool & {
  execute: (inputData: any) => Promise<any>;
};

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

  createToolCallStep({ tools }: { tools?: Tool[] }) {
    return createStep({
      id: 'toolCallStep',
      inputSchema: z.any(),
      outputSchema: z.any(),
      execute: async ({ inputData }) => {
        const tool = tools?.find(tool => tool.name === inputData.toolName);

        if (!tool) {
          throw new Error(`Tool ${inputData.toolName} not found`);
        }

        const result = await tool.execute({ inputData: JSON.parse(inputData.args) });

        return { result, ...inputData };
      },
    });
  }

  createLLMStep({
    writer,
    model,
    tools,
    toolChoice,
    providerMetadata,
    runId,
    messageId,
    responseId,
    _internal,
  }: {
    writer: WritableStreamDefaultWriter<any>;
    model: LanguageModel;
    tools?: Tool[];
    toolChoice?: LanguageModelV1ToolChoice;
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
  }) {
    return createStep({
      id: 'generateText',
      inputSchema: z.any(),
      outputSchema: z.any(),
      execute: async ({ inputData }) => {
        await writer.write({
          type: 'step-start',
          payload: {
            request: {},
            warnings: [],
            messageId: messageId,
          },
        });

        this.stepCount++;

        const messageList = this.toMessageList(inputData.messages || []);

        const agentStream = new MastraAgentStream({
          createStream: async () => {
            try {
              const stream = await model.doStream({
                inputFormat: 'messages',
                mode: {
                  type: 'regular',
                  tools,
                  toolChoice,
                },
                providerMetadata,
                prompt: messageList.get.all.core() as any,
              });

              return stream.stream as any;
            } catch (error) {
              console.error(error);
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
          getOptions: () => {
            return { runId };
          },
        });

        let responseMetadata: Record<string, any> | undefined = undefined;

        for await (const chunk of agentStream) {
          switch (chunk.type) {
            case 'response-metadata':
              responseMetadata = {
                id: chunk.payload.id,
                timestamp: chunk.payload.timestamp,
                modelId: chunk.payload.modelId,
                headers: chunk.payload.headers,
              };
              break;
            case 'finish':
              console.log('Writing finish', chunk);
              await writer.write({
                payload: {
                  ...chunk.payload,
                  usage: {
                    promptTokens: chunk.payload.totalUsage.promptTokens,
                    completionTokens: chunk.payload.totalUsage.completionTokens,
                    totalTokens:
                      chunk.payload.totalUsage.totalTokens ||
                      chunk.payload.totalUsage.promptTokens + chunk.payload.totalUsage.completionTokens,
                  },
                  response: responseMetadata || {
                    id: responseId,
                    timestamp: _internal?.currentDate?.(),
                    modelId: model.modelId,
                    headers: undefined,
                  },
                  messageId,
                  isContinued: chunk.payload.reason === 'stop' ? false : true,
                  warnings: chunk.payload.warnings,
                  experimental_providerMetadata: providerMetadata,
                  providerMetadata,
                  request: {},
                },
                type: 'step-finish',
              });
              break;
            default:
              await writer.write(chunk);
          }
        }

        const text = await agentStream.text;
        const toolCalls = await agentStream.toolCalls;
        const finishReason = await agentStream.finishReason;

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
                args: JSON.parse(toolCall.args),
              };
            }) as any),
          ];

          messageList.add(
            {
              role: 'assistant',
              content: assistantContent,
            },
            'response',
          );
        } else {
          messageList.add(
            {
              role: 'assistant',
              content: [{ type: 'text', text }],
            },
            'response',
          );
        }

        const messages = messageList.get.all.core();

        const usage = await agentStream.usage;

        return {
          response: {
            finishReason,
            text,
            toolCalls,
            usage: {
              promptTokens: usage.promptTokens + (inputData.response?.usage?.promptTokens || 0),
              completionTokens: usage.completionTokens + (inputData.response?.usage?.completionTokens || 0),
              totalTokens: usage.promptTokens + usage.completionTokens + (inputData.response?.usage?.totalTokens || 0),
            },
            metadata: responseMetadata,
          },
          messages,
        };
      },
    });
  }

  createExecutionWorkflow({
    writer,
    model,
    tools,
    toolChoice,
    providerMetadata,
    runId,
    responseId,
    experimental_generateMessageId,
    _internal,
  }: {
    writer: WritableStreamDefaultWriter<any>;
    model: LanguageModel;
    tools?: Tool[];
    toolChoice?: LanguageModelV1ToolChoice;
    providerMetadata?: Record<string, any>;
    runId: string;
    responseId?: string;
    experimental_generateMessageId?: () => string;
    _internal: {
      currentDate: () => Date;
      now: () => number;
      generateId: () => string;
    };
  }) {
    const messageId = experimental_generateMessageId?.() || _internal.generateId?.();

    const llmStep = this.createLLMStep({
      writer,
      model,
      tools,
      toolChoice,
      providerMetadata,
      runId,
      responseId,
      messageId,
      _internal,
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
      .map(async ({ getStepResult, inputData }) => {
        const initialResult = getStepResult(llmStep);

        const messageList = this.toMessageList(initialResult.messages || []);

        if (inputData?.length) {
          messageList.add(
            {
              role: 'tool',
              content: inputData.map(toolCall => {
                return {
                  type: 'tool-result',
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  result: toolCall.result,
                };
              }),
            },
            'response',
          );
        }

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
    experimental_generateMessageId,
    _internal = {
      currentDate: () => new Date(),
      now: () => Date.now(),
      generateId,
    },
  }: {
    runId?: string;
    model: LanguageModel;
    tools?: Tool[];
    toolChoice?: LanguageModelV1ToolChoice;
    system?: string;
    prompt: string;
    threadId?: string;
    resourceId?: string;
    maxSteps?: number;
    maxRetries?: number;
    providerMetadata?: Record<string, any>;
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

    const agentStream = new MastraAgentStream({
      getOptions: () => {
        return {
          runId: runId,
        };
      },
      createStream: async writer => {
        const readableStream = new ReadableStream({
          start: async controller => {
            const agentStreamWriter = writer.getWriter();

            const workflowStream = new WritableStream({
              write: async chunk => {
                await agentStreamWriter.write(chunk);
              },
            });

            const responseId = _internal.generateId?.();

            const workflowStreamWriter = workflowStream.getWriter();

            const executionWorkflow = this.createExecutionWorkflow({
              writer: workflowStreamWriter,
              model,
              tools: tools || undefined,
              toolChoice: toolChoice,
              providerMetadata: providerMetadata,
              runId,
              experimental_generateMessageId,
              _internal,
              responseId,
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
                return inputData.response.finishReason !== 'stop' && this.stepCount < maxSteps;
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

            const executionResult = await run.start({
              inputData: {
                messages,
              },
            });

            if (executionResult.status !== 'success') {
              controller.close();
              return;
            }

            console.log('Execution result', executionResult.result.response);

            await workflowStreamWriter.write({
              type: 'finish',
              payload: {
                logprobs: executionResult.result.response.logprobs,
                usage: executionResult.result.response.usage,
                finishReason: executionResult.result.response.finishReason,
                response: executionResult.result?.response?.metadata,
                providerMetadata,
                experimental_providerMetadata: providerMetadata,
              },
            });

            controller.close();
          },
        });

        return readableStream as any;
      },
    });

    return agentStream;
  }
}
