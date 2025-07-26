import { generateId, type LanguageModel, type ToolSet } from 'ai';
import { z } from 'zod';
import { MessageList } from '../../agent/message-list';
import { MastraAgentStream } from '../../stream/MastraAgentStream';
import { createWorkflow, createStep } from '../../workflows';
import { prepareToolsAndToolChoice } from './prepare-tools';

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

        const messageList = this.toMessageList(initialResult.messages);

        const result = await tool.execute(JSON.parse(inputData.args), {
          toolCallId: inputData.toolCallId,
          messages: messageList.get.all.ui().map(message => ({
            role: message.role,
            content: message.content,
          })) as any,
        });

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
    _internal,
  }: {
    writer: WritableStreamDefaultWriter<any>;
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
                  ...prepareToolsAndToolChoice({
                    tools,
                    toolChoice: toolChoice as any,
                    activeTools: Object.keys(tools || {}),
                  }),
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

        const defaultResponseMetadata = {
          id: _internal?.generateId?.(),
          timestamp: _internal?.currentDate?.(),
          modelId: model.modelId,
          headers: undefined,
        };

        let responseMetadata: Record<string, any> | undefined = undefined;

        let providerMetadata: Record<string, any> | undefined = undefined;

        let stepFinishPayload;

        let hasErrored = false;

        for await (const chunk of agentStream) {
          switch (chunk.type) {
            case 'error':
              hasErrored = true;
              await writer.write(chunk);
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
                totalUsage: {
                  promptTokens: chunk.payload.totalUsage.promptTokens,
                  completionTokens: chunk.payload.totalUsage.completionTokens,
                  totalTokens:
                    chunk.payload.totalUsage.totalTokens ||
                    chunk.payload.totalUsage.promptTokens + chunk.payload.totalUsage.completionTokens,
                },
                response: responseMetadata || defaultResponseMetadata,
                messageId,
                isContinued: !['stop', 'error'].includes(chunk.payload.reason),
                warnings: chunk.payload.warnings,
                experimental_providerMetadata: chunk.payload.providerMetadata,
                providerMetadata: chunk.payload.providerMetadata,
                request: {},
              };
              break;
            default:
              await writer.write(chunk);
          }

          if (hasErrored) {
            break;
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

        console.log('usage', usage);

        return {
          response: {
            stepFinishPayload,
            finishReason: hasErrored ? 'error' : finishReason,
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
    experimental_generateMessageId,
    _internal,
  }: {
    writer: WritableStreamDefaultWriter<any>;
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
  }) {
    const messageId = experimental_generateMessageId?.() || _internal.generateId?.();

    const llmStep = this.createLLMStep({
      writer,
      model,
      tools,
      toolChoice,
      providerMetadata,
      runId,
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
      .map(async ({ getStepResult, inputData, bail }) => {
        const initialResult = getStepResult(llmStep);

        console.log('stepFinishPayload', initialResult.response.stepFinishPayload);

        if (inputData?.every(toolCall => toolCall?.result === undefined)) {
          await writer.write({
            type: 'step-finish',
            payload: initialResult.response.stepFinishPayload,
          });

          return bail(initialResult);
        }

        const messageList = this.toMessageList(initialResult.messages || []);

        if (inputData?.length) {
          for (const toolCall of inputData) {
            await writer.write({
              type: 'tool-result',
              payload: {
                args: JSON.parse(toolCall.args),
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                result: toolCall.result,
              },
            });
          }

          messageList.add(
            {
              role: 'tool',
              content: inputData.map(toolCall => {
                return {
                  type: 'tool-result',
                  args: JSON.parse(toolCall.args),
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  result: toolCall.result,
                };
              }),
            },
            'response',
          );
        }

        await writer.write({
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

            // We call this for no reason because of aisdk
            _internal.generateId?.();

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
                return !['stop', 'error'].includes(inputData.response.finishReason) && this.stepCount < maxSteps;
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

            // console.log('Execution result', executionResult.result.response);

            await workflowStreamWriter.write({
              type: 'finish',
              payload: {
                logprobs: executionResult.result.response.logprobs,
                usage: executionResult.result.response.usage,
                finishReason: executionResult.result.response.finishReason,
                response: executionResult.result?.response?.metadata,
                providerMetadata: executionResult.result?.response?.providerMetadata,
                experimental_providerMetadata: executionResult.result?.response?.providerMetadata,
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
