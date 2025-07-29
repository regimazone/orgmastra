import { ReadableStream } from 'stream/web';
import type { LanguageModelV1Prompt } from 'ai';
import { generateId } from 'ai';
import { z } from 'zod';
import { MessageList } from '../../../agent';
import type { ChunkType } from '../../../stream/types';
import { createStep, createWorkflow } from '../../../workflows';
import { executeV4 } from './ai-sdk/v4';
import { MastraModelOutput } from './base';
import { AgenticRunState } from './run-state';
import type { AgentWorkflowProps, StreamExecutorProps } from './types';

const toolCallInpuSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.any(),
});

const agenticLoopInputSchema = z.object({
  messages: z.array(z.any()),
  response: z.any(),
});

const toolCallOutputSchema = toolCallInpuSchema.extend({
  result: z.any(),
});

const llmIterationOutputSchema = z.object({
  response: z.any(),
  messages: z.array(z.any()),
  userMessages: z.array(z.any()),
});

function createAgentWorkflow({
  messageId,
  model,
  runId,
  providerMetadata,
  tools,
  toolChoice,
  activeTools,
  toolCallStreaming,
  _internal,
  controller,
  options,
}: AgentWorkflowProps) {
  function toolCallStep() {
    return createStep({
      id: 'toolCallStep',
      inputSchema: toolCallInpuSchema,
      outputSchema: toolCallOutputSchema,
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

        const messageList = MessageList.fromArray(initialResult.userMessages);

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

  function createLLMExecutionStep() {
    return createStep({
      id: 'generateText',
      inputSchema: z.object({
        response: z.any(),
        messages: z.array(z.any()),
      }),
      outputSchema: llmIterationOutputSchema,
      execute: async ({ inputData }) => {
        const messageList = MessageList.fromArray(inputData.messages);

        const runState = new AgenticRunState({
          _internal,
          model,
        });

        let modelResult;

        switch (model.specificationVersion) {
          case 'v1': {
            modelResult = executeV4({
              model,
              runId,
              providerMetadata,
              inputMessages: inputData.messages,
              tools,
              toolChoice,
              activeTools,
              _internal,
              options,
            });
            break;
          }
          default: {
            throw new Error(`Unsupported model version: ${model.specificationVersion}`);
          }
        }

        const { stream, warnings, request, rawResponse } = modelResult;

        const outputStream = new MastraModelOutput({
          stream: stream!,
          options: {
            toolCallStreaming,
          },
        });

        controller.enqueue({
          runId,
          from: 'AGENT',
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
                runState.setState({
                  hasErrored: true,
                });

                controller.enqueue(chunk);

                runState.setState({
                  stepFinishPayload: {
                    isContinued: false,
                    reason: 'error',
                    totalUsage: {
                      promptTokens: 0,
                      completionTokens: 0,
                      totalTokens: 0,
                    },
                  },
                });

                break;
              case 'response-metadata':
                runState.setState({
                  responseMetadata: {
                    id: chunk.payload.id,
                    timestamp: chunk.payload.timestamp,
                    modelId: chunk.payload.modelId,
                    headers: chunk.payload.headers,
                  },
                });
                break;
              case 'finish':
                providerMetadata = chunk.payload.providerMetadata;
                runState.setState({
                  stepFinishPayload: {
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
                      ...(runState.state.responseMetadata || {}),
                      headers: rawResponse?.headers,
                      messages: [],
                    },
                    messageId,
                    isContinued: !['stop', 'error'].includes(chunk.payload.reason),
                    experimental_providerMetadata: chunk.payload.providerMetadata,
                    providerMetadata: chunk.payload.providerMetadata,
                    request,
                  },
                });
                break;
              case 'reasoning': {
                const reasoningDeltasFromState = runState.state.reasoningDeltas;
                reasoningDeltasFromState.push(chunk.payload.text);
                runState.setState({
                  reasoningDeltas: reasoningDeltasFromState,
                });
                controller.enqueue(chunk);
                break;
              }
              case 'reasoning-signature': {
                const reasoningDeltasFromState = runState.state.reasoningDeltas;
                if (reasoningDeltasFromState.length) {
                  messageList.add(
                    {
                      id: messageId,
                      role: 'assistant',
                      content: [
                        {
                          type: 'reasoning',
                          text: reasoningDeltasFromState.join(''),
                          signature: chunk.payload.signature,
                        },
                      ],
                    },
                    'response',
                  );

                  runState.setState({
                    reasoningDeltas: [],
                  });
                }

                controller.enqueue(chunk);
                break;
              }
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
                const hasToolCallStreaming = runState.state.hasToolCallStreaming;
                if (!hasToolCallStreaming) {
                  controller.enqueue({
                    type: 'tool-call-streaming-start',
                    from: 'AGENT',
                    runId: chunk.runId,
                    payload: {
                      toolCallId: chunk.payload.toolCallId,
                      toolName: chunk.payload.toolName,
                    },
                  });

                  options?.onChunk?.({
                    type: 'tool-call-streaming-start',
                    from: 'AGENT',
                    runId: chunk.runId,
                    payload: {
                      toolCallId: chunk.payload.toolCallId,
                      toolName: chunk.payload.toolName,
                    },
                  });

                  runState.setState({
                    hasToolCallStreaming: true,
                  });
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
                controller.enqueue(chunk);
                break;
              default:
                controller.enqueue(chunk);
            }

            if (['text-delta', 'reasoning', 'source', 'tool-call', 'tool-call-delta'].includes(chunk.type)) {
              options?.onChunk?.(chunk);
            }

            if (runState.state.hasErrored) {
              break;
            }
          }
        } catch {
          runState.setState({
            hasErrored: true,
            stepFinishPayload: {
              isContinued: false,
              reason: 'error',
              totalUsage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
              },
            },
          });
        }

        const toolCalls = outputStream.toolCalls;
        const text = outputStream.text;

        /**
         * Update Message List piece
         */

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

        /**
         * Assemble messages
         */

        const allMessages = messageList.get.all.v1().map(message => {
          return {
            id: message.id,
            role: message.role,
            content: message.content,
          };
        });

        const userMessages = allMessages.filter(message => message.role === 'user');
        const nonUserMessages = allMessages.filter(message => message.role !== 'user');

        const stepFinishPayload = runState.state.stepFinishPayload;

        if (stepFinishPayload && stepFinishPayload.response) {
          stepFinishPayload.response.messages = nonUserMessages as any;
        }

        const hasErrored = runState.state.hasErrored;
        const usage = outputStream.usage;
        const responseMetadata = runState.state.responseMetadata;

        return {
          response: {
            headers: rawResponse?.headers,
            warnings,
            stepFinishPayload,
            reason: hasErrored ? 'error' : outputStream.finishReason,
            text,
            toolCalls,
            usage: {
              promptTokens: usage.promptTokens + (inputData.response?.usage?.promptTokens || 0),
              completionTokens: usage.completionTokens + (inputData.response?.usage?.completionTokens || 0),
              totalTokens: usage.promptTokens + usage.completionTokens + (inputData.response?.usage?.totalTokens || 0),
            },
            providerMetadata: providerMetadata,
            metadata: responseMetadata,
          },
          userMessages: userMessages,
          messages: nonUserMessages,
        };
      },
    });
  }

  function llmMappingStep() {
    return createStep({
      id: 'llmExecutionMappingStep',
      inputSchema: z.array(toolCallOutputSchema),
      outputSchema: llmIterationOutputSchema,
      execute: async ({ inputData, getStepResult, bail }) => {
        const initialResult = getStepResult(llmExecutionStep);

        console.log('stepFinishPayload', initialResult.response.stepFinishPayload);

        const messageList = MessageList.fromArray(initialResult.messages || []);

        if (inputData?.every(toolCall => toolCall?.result === undefined)) {
          controller.enqueue({
            type: 'step-finish',
            runId,
            from: 'AGENT',
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

            controller.enqueue(chunk);

            options?.onChunk?.(chunk);
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

        controller.enqueue({
          type: 'step-finish',
          runId,
          from: 'AGENT',
          payload: initialResult.response.stepFinishPayload,
        });

        return {
          ...initialResult,
          messages: messageList.get.all.core(),
        };
      },
    });
  }

  const llmExecutionStep = createLLMExecutionStep();
  const toolCallExecutionStep = toolCallStep();
  const llmExecutionMappingStep = llmMappingStep();

  return createWorkflow({
    id: 'executionWorkflow',
    inputSchema: agenticLoopInputSchema,
    outputSchema: z.any(),
  })
    .then(llmExecutionStep)
    .map(({ inputData }) => {
      return inputData.response.toolCalls || [];
    })
    .foreach(toolCallExecutionStep)
    .then(llmExecutionMappingStep)
    .commit();
}

function createStreamExecutor({
  _internal,
  experimental_generateMessageId,
  model,
  runId,
  providerMetadata,
  tools,
  toolChoice,
  activeTools,
  inputMessages,
  options,
  maxRetries = 2,
  maxSteps = 5,
}: StreamExecutorProps) {
  return new ReadableStream<ChunkType>({
    start: async controller => {
      const messageId = experimental_generateMessageId?.() || _internal.generateId?.();

      let stepCount = 0;

      const outerAgentWorkflow = createAgentWorkflow({
        messageId: messageId!,
        model,
        runId,
        providerMetadata,
        tools,
        toolChoice,
        activeTools,
        inputMessages,
        _internal,
        controller,
        options,
      });

      const mainWorkflow = createWorkflow({
        id: 'agentic-loop',
        inputSchema: agenticLoopInputSchema,
        outputSchema: z.any(),
        retryConfig: {
          attempts: maxRetries,
        },
      })
        .dowhile(outerAgentWorkflow, async ({ inputData }) => {
          return !['stop', 'error'].includes(inputData.response.reason) && stepCount < maxSteps;
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
          messages: inputMessages,
        },
      });

      if (executionResult.status !== 'success') {
        controller.close();
        return;
      }

      // @TODO: CLEAN THIS SHIT UP BELOW

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

      controller.enqueue({
        type: 'finish',
        runId,
        from: 'AGENT',
        payload: finishPayload,
      });

      controller.close();
    },
  });
}

export async function execute(
  props: { system?: string; prompt?: string } & { resourceId?: string; threadId?: string } & Omit<
      StreamExecutorProps,
      'inputMessages'
    >,
) {
  const { system, prompt, resourceId, threadId, runId, _internal, ...rest } = props;

  let runIdToUse = runId;

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

  const messages = messageList.get.all.core() as LanguageModelV1Prompt;

  if (!runIdToUse) {
    runIdToUse = crypto.randomUUID();
  }

  if (_internal) {
    // We call this for no reason because of aisdk
    _internal.generateId?.();
  }

  const streamExecutorProps: StreamExecutorProps = {
    runId,
    _internal: _internal || {
      currentDate: () => new Date(),
      now: () => Date.now(),
      generateId,
    },
    inputMessages: messages,
    ...rest,
  };

  const executor = createStreamExecutor(streamExecutorProps);

  return new MastraModelOutput({
    stream: executor,
    options: {
      toolCallStreaming: rest.toolCallStreaming,
    },
  });
}
