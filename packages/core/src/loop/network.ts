import type { JSONSchema7 } from 'json-schema';
import z from 'zod';
import type { ZodSchema } from 'zod';
import type { Agent, AgentExecutionOptions } from '../agent';
import { MessageList } from '../agent/message-list';
import type { MastraMessageV2, MessageListInput } from '../agent/message-list';
import type { RuntimeContext } from '../runtime-context';
import type { OutputSchema } from '../stream';
import { createStep, createWorkflow } from '../workflows';
import { EMITTER_SYMBOL } from '../workflows/constants';
import { RESOURCE_TYPES } from './types';

export function getLastMessage(messages: MessageListInput) {
  let message = '';
  if (typeof messages === 'string') {
    message = messages;
  } else {
    const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : messages;
    if (typeof lastMessage === 'string') {
      message = lastMessage;
    } else if (lastMessage && `content` in lastMessage && lastMessage?.content) {
      const lastMessageContent = lastMessage.content;
      if (typeof lastMessageContent === 'string') {
        message = lastMessageContent;
      } else if (Array.isArray(lastMessageContent)) {
        const lastPart = lastMessageContent[lastMessageContent.length - 1];
        if (lastPart?.type === 'text') {
          message = lastPart.text;
        }
      }
    }
  }

  return message;
}

export async function prepareMemoryStep({
  threadId,
  resourceId,
  messages,
  routingAgent,
  runtimeContext,
  generateId,
}: {
  threadId: string;
  resourceId: string;
  messages: MessageListInput;
  routingAgent: Agent;
  runtimeContext: RuntimeContext;
  generateId: () => string;
}) {
  const memory = await routingAgent.getMemory({ runtimeContext });
  let thread = await memory?.getThreadById({ threadId });
  if (!thread) {
    thread = await memory?.createThread({
      threadId,
      title: '',
      resourceId,
    });
  }
  if (typeof messages === 'string') {
    await memory?.saveMessages({
      messages: [
        {
          id: generateId(),
          type: 'text',
          role: 'user',
          content: { parts: [{ type: 'text', text: messages }], format: 2 },
          createdAt: new Date(),
          threadId: thread?.id,
          resourceId: thread?.resourceId,
        },
      ] as MastraMessageV2[],
      format: 'v2',
    });
  } else {
    const messageList = new MessageList({
      threadId: thread?.id,
      resourceId: thread?.resourceId,
    });
    messageList.add(messages, 'user');
    const messagesToSave = messageList.get.all.v2();

    await memory?.saveMessages({
      messages: messagesToSave,
      format: 'v2',
    });
  }

  return { thread };
}

export async function createNetworkLoop<
  OUTPUT extends OutputSchema | undefined = undefined,
  STRUCTURED_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined,
  FORMAT extends 'aisdk' | 'mastra' | undefined = undefined,
>({
  networkName,
  runtimeContext,
  runId,
  routingAgent,
  routingAgentOptions,
  generateId,
}: {
  networkName: string;
  runtimeContext: RuntimeContext;
  runId: string;
  routingAgent: Agent;
  routingAgentOptions?: AgentExecutionOptions<OUTPUT, STRUCTURED_OUTPUT, FORMAT>;
  generateId: () => string;
}) {
  const routingStep = createStep({
    id: 'routing-step',
    inputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      result: z.string().optional(),
      iteration: z.number(),
      threadId: z.string().optional(),
      threadResourceId: z.string().optional(),
      isOneOff: z.boolean(),
      verboseIntrospection: z.boolean(),
    }),
    outputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      selectionReason: z.string(),
      iteration: z.number(),
    }),
    execute: async ({ inputData, getInitData }) => {
      const initData = await getInitData();

      const completionSchema = z.object({
        isComplete: z.boolean(),
        finalResult: z.string(),
        completionReason: z.string(),
      });
      let completionResult;
      if (inputData.resourceType !== 'none' && inputData?.result) {
        // Check if the task is complete
        const completionPrompt = `
                          The ${inputData.resourceType} ${inputData.resourceId} has contributed to the task.
                          This is the result from the agent: ${inputData.result}
  
                          You need to evaluate that our task is complete. Pay very close attention to the SYSTEM INSTRUCTIONS for when the task is considered complete. Only return true if the task is complete according to the system instructions. Pay close attention to the finalResult and completionReason.
                          Original task: ${inputData.task}
  
                          {
                              "isComplete": boolean,
                              "completionReason": string,
                              "finalResult": string
                          }
                      `;

        completionResult = await routingAgent.generateVNext([{ role: 'assistant', content: completionPrompt }], {
          ...routingAgentOptions,
          output: completionSchema,
          threadId: initData?.threadId ?? runId,
          resourceId: initData?.threadResourceId ?? networkName,
          runtimeContext: runtimeContext,
        });

        if (completionResult?.object?.isComplete) {
          return {
            task: inputData.task,
            resourceId: '',
            resourceType: 'none' as z.infer<typeof RESOURCE_TYPES>,
            prompt: '',
            result: completionResult.object.finalResult,
            isComplete: true,
            selectionReason: completionResult.object.completionReason || '',
            iteration: inputData.iteration + 1,
          };
        }
      }

      const prompt: MessageListInput = [
        {
          role: 'assistant',
          content: `
                    ${inputData.isOneOff ? 'You are executing just one primitive based on the user task. Make sure to pick the primitive that is the best suited to accomplish the whole task. Primitives that execute only part of the task should be avoided.' : 'You will be calling just *one* primitive at a time to accomplish the user task, every call to you is one decision in the process of accomplishing the user task. Make sure to pick primitives that are the best suited to accomplish the whole task. Completeness is the highest priority.'}
  
                    The user has given you the following task: 
                    ${inputData.task}
                    ${completionResult ? `\n\n${completionResult?.object?.finalResult}` : ''}
  
                    Please select the most appropriate primitive to handle this task and the prompt to be sent to the primitive.
                    If you are calling the same agent again, make sure to adjust the prompt to be more specific.
  
                    {
                        "resourceId": string,
                        "resourceType": "agent" | "workflow" | "tool",
                        "prompt": string,
                        "selectionReason": string
                    }
  
                    The 'selectionReason' property should explain why you picked the primitive${inputData.verboseIntrospection ? ', as well as why the other primitives were not picked.' : '.'}
                    `,
        },
      ];

      const options = {
        output: z.object({
          resourceId: z.string(),
          resourceType: RESOURCE_TYPES,
          prompt: z.string(),
          selectionReason: z.string(),
        }),
        threadId: initData?.threadId ?? runId,
        resourceId: initData?.threadResourceId ?? networkName,
        runtimeContext: runtimeContext,
      };

      const result = await routingAgent.generateVNext(prompt, options);

      return {
        task: inputData.task,
        result: '',
        resourceId: result.object.resourceId,
        resourceType: result.object.resourceType,
        prompt: result.object.prompt,
        isComplete: result.object.resourceId === 'none' && result.object.resourceType === 'none' ? true : false,
        selectionReason: result.object.selectionReason,
        iteration: inputData.iteration + 1,
      };
    },
  });

  const agentStep = createStep({
    id: 'agent-step',
    inputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      selectionReason: z.string(),
      iteration: z.number(),
    }),
    outputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      result: z.string(),
      isComplete: z.boolean().optional(),
      iteration: z.number(),
    }),
    execute: async ({ inputData, [EMITTER_SYMBOL]: emitter, getInitData }) => {
      const agentsMap = await routingAgent.getAgents({ runtimeContext });

      const agentId = inputData.resourceId;

      const agent = agentsMap[inputData.resourceId];

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      let streamPromise = {} as {
        promise: Promise<string>;
        resolve: (value: string) => void;
        reject: (reason?: any) => void;
      };

      streamPromise.promise = new Promise((resolve, reject) => {
        streamPromise.resolve = resolve;
        streamPromise.reject = reject;
      });

      const toolData = {
        name: agent.name,
        args: inputData,
      };

      await emitter.emit('watch-v2', {
        type: 'tool-call-streaming-start',
        ...toolData,
      });

      const result = await agent.streamVNext(inputData.prompt, {
        // resourceId: inputData.resourceId,
        // threadId: inputData.threadId,
        runtimeContext: runtimeContext,
        onFinish: res => {
          streamPromise.resolve(res.text);
        },
      });

      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'text-delta':
            await emitter.emit('watch-v2', {
              type: 'tool-call-delta',
              ...toolData,
              argsTextDelta: chunk.payload.text,
            });
            break;

          case 'step-start':
          case 'step-finish':
          case 'finish':
          case 'tool-call':
          case 'tool-result':
          case 'tool-call-input-streaming-start':
          case 'tool-call-delta':
            break;
          case 'source':
          case 'file':
          default:
            await emitter.emit('watch-v2', chunk);
            break;
        }
      }

      const finalResult = await streamPromise.promise;

      const memory = await routingAgent.getMemory({ runtimeContext: runtimeContext });

      const initData = await getInitData();

      await memory?.saveMessages({
        messages: [
          {
            id: generateId(),
            type: 'text',
            role: 'assistant',
            content: { parts: [{ type: 'text', text: finalResult }], format: 2 },
            createdAt: new Date(),
            threadId: initData.threadId || runId,
            resourceId: initData.threadResourceId || networkName,
          },
        ] as MastraMessageV2[],
        format: 'v2',
      });

      return {
        task: inputData.task,
        resourceId: inputData.resourceId,
        resourceType: inputData.resourceType,
        result: finalResult,
        isComplete: false,
        iteration: inputData.iteration,
      };
    },
  });

  const workflowStep = createStep({
    id: 'workflow-step',
    inputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      selectionReason: z.string(),
      iteration: z.number(),
    }),
    outputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      result: z.string(),
      isComplete: z.boolean().optional(),
      iteration: z.number(),
    }),
    execute: async ({ inputData, [EMITTER_SYMBOL]: emitter, getInitData }) => {
      const workflowsMap = await routingAgent.getWorkflows({ runtimeContext: runtimeContext });
      const wf = workflowsMap[inputData.resourceId];

      if (!wf) {
        throw new Error(`Workflow ${inputData.resourceId} not found`);
      }

      let input;
      try {
        input = JSON.parse(inputData.prompt);
      } catch (e: unknown) {
        console.error(e);
        throw new Error(`Invalid task input: ${inputData.task}`);
      }

      let streamPromise = {} as {
        promise: Promise<any>;
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
      };

      streamPromise.promise = new Promise((resolve, reject) => {
        streamPromise.resolve = resolve;
        streamPromise.reject = reject;
      });
      const toolData = {
        name: wf.name,
        args: inputData,
      };
      await emitter.emit('watch-v2', {
        type: 'tool-call-streaming-start',
        ...toolData,
      });

      const run = wf.createRun();

      const stream = run.streamVNext({
        inputData: input,
        runtimeContext: runtimeContext,
      });

      let result: any;
      let stepResults: Record<string, any> = {};
      for await (const chunk of stream) {
        const c: any = chunk;
        // const c = chunk;
        switch (c.type) {
          case 'text-delta':
            await emitter.emit('watch-v2', {
              type: 'tool-call-delta',
              ...toolData,
              argsTextDelta: c.textDelta,
            });
            break;

          case 'step-result':
            if (c?.payload?.output) {
              result = c?.payload?.output;
              stepResults[c?.payload?.id] = c?.payload?.output;
            }
            await emitter.emit('watch-v2', c);
            break;
          case 'finish':
            streamPromise.resolve(result);
            break;

          case 'start':
          case 'step-start':
          case 'step-finish':
          case 'tool-call':
          case 'tool-result':
          case 'tool-call-streaming-start':
          case 'tool-call-delta':
          case 'source':
          case 'file':
          default:
            await emitter.emit('watch-v2', c);
            break;
        }
      }

      let runSuccess = true;
      const runResult = await streamPromise.promise;

      const workflowState = await stream.result;

      if (!workflowState?.status || workflowState?.status === 'failed') {
        runSuccess = false;
      }

      const finalResult = JSON.stringify({
        runId: run.runId,
        runResult,
        runSuccess,
      });

      const memory = await routingAgent.getMemory({ runtimeContext: runtimeContext });
      const initData = await getInitData();
      await memory?.saveMessages({
        messages: [
          {
            id: generateId(),
            type: 'text',
            role: 'assistant',
            content: { parts: [{ type: 'text', text: finalResult }], format: 2 },
            createdAt: new Date(),
            threadId: initData.threadId || runId,
            resourceId: initData.threadResourceId || networkName,
          },
        ] as MastraMessageV2[],
        format: 'v2',
      });

      return {
        result: finalResult || '',
        task: inputData.task,
        resourceId: inputData.resourceId,
        resourceType: inputData.resourceType,
        isComplete: false,
        iteration: inputData.iteration,
      };
    },
  });

  const toolStep = createStep({
    id: 'toolStep',
    inputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      selectionReason: z.string(),
      iteration: z.number(),
    }),
    outputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      result: z.string(),
      isComplete: z.boolean().optional(),
      iteration: z.number(),
    }),
    execute: async ({ inputData, getInitData }) => {
      const toolsMap = await routingAgent.getTools({ runtimeContext });
      const tool = toolsMap[inputData.resourceId];

      if (!tool) {
        throw new Error(`Tool ${inputData.resourceId} not found`);
      }

      if (!tool.execute) {
        throw new Error(`Tool ${inputData.resourceId} does not have an execute function`);
      }

      let inputDataToUse: any;
      try {
        inputDataToUse = JSON.parse(inputData.prompt);
      } catch (e: unknown) {
        console.error(e);
        throw new Error(`Invalid task input: ${inputData.task}`);
      }

      const finalResult: any = await tool.execute(
        {
          runtimeContext,
          mastra: routingAgent.getMastraInstance(),
          resourceId: inputData.resourceId,
          threadId: runId,
          runId,
          context: inputDataToUse,
          // TODO: Pass proper tracing context when network supports tracing
          tracingContext: { currentSpan: undefined },
        },
        { toolCallId: generateId(), messages: [] },
      );

      const memory = await routingAgent.getMemory({ runtimeContext: runtimeContext });
      const initData = await getInitData();
      await memory?.saveMessages({
        messages: [
          {
            id: generateId(),
            type: 'text',
            role: 'assistant',
            content: { parts: [{ type: 'text', text: JSON.stringify(finalResult) }], format: 2 },
            createdAt: new Date(),
            threadId: initData.threadId || runId,
            resourceId: initData.threadResourceId || networkName,
          },
        ] as MastraMessageV2[],
        format: 'v2',
      });

      return {
        task: inputData.task,
        resourceId: inputData.resourceId,
        resourceType: inputData.resourceType,
        result: finalResult,
        isComplete: false,
        iteration: inputData.iteration,
      };
    },
  });

  const finishStep = createStep({
    id: 'finish-step',
    inputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      selectionReason: z.string(),
      iteration: z.number(),
    }),
    outputSchema: z.object({
      task: z.string(),
      result: z.string(),
      isComplete: z.boolean(),
      iteration: z.number(),
    }),
    execute: async ({ inputData }) => {
      return {
        task: inputData.task,
        result: inputData.result,
        isComplete: !!inputData.isComplete,
        iteration: inputData.iteration,
      };
    },
  });

  const networkWorkflow = createWorkflow({
    id: 'Agent-Network-Outer-Workflow',
    inputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      result: z.string().optional(),
      iteration: z.number(),
      threadId: z.string().optional(),
      threadResourceId: z.string().optional(),
      isOneOff: z.boolean(),
      verboseIntrospection: z.boolean(),
    }),
    outputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      completionReason: z.string().optional(),
      iteration: z.number(),
      threadId: z.string().optional(),
      threadResourceId: z.string().optional(),
      isOneOff: z.boolean(),
    }),
  });

  networkWorkflow
    .then(routingStep)
    .branch([
      [async ({ inputData }) => !inputData.isComplete && inputData.resourceType === 'agent', agentStep],
      [async ({ inputData }) => !inputData.isComplete && inputData.resourceType === 'workflow', workflowStep],
      [async ({ inputData }) => !inputData.isComplete && inputData.resourceType === 'tool', toolStep],
      [async ({ inputData }) => inputData.isComplete, finishStep],
    ])
    .map({
      task: {
        step: [routingStep, agentStep, workflowStep, toolStep],
        path: 'task',
      },
      isComplete: {
        step: [agentStep, workflowStep, toolStep, finishStep],
        path: 'isComplete',
      },
      completionReason: {
        step: [routingStep, agentStep, workflowStep, toolStep, finishStep],
        path: 'completionReason',
      },
      result: {
        step: [agentStep, workflowStep, toolStep, finishStep],
        path: 'result',
      },
      resourceId: {
        step: [routingStep, agentStep, workflowStep, toolStep],
        path: 'resourceId',
      },
      resourceType: {
        step: [routingStep, agentStep, workflowStep, toolStep],
        path: 'resourceType',
      },
      iteration: {
        step: [routingStep, agentStep, workflowStep, toolStep],
        path: 'iteration',
      },
      isOneOff: {
        initData: networkWorkflow,
        path: 'isOneOff',
      },
      threadId: {
        initData: networkWorkflow,
        path: 'threadId',
      },
      threadResourceId: {
        initData: networkWorkflow,
        path: 'threadResourceId',
      },
    })
    .commit();

  return { networkWorkflow };
}

export async function networkLoop<
  OUTPUT extends OutputSchema | undefined = undefined,
  STRUCTURED_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined,
  FORMAT extends 'aisdk' | 'mastra' | undefined = undefined,
>({
  networkName,
  runtimeContext,
  runId,
  routingAgent,
  routingAgentOptions,
  generateId,
  maxIterations,
  threadId,
  resourceId,
  messages,
}: {
  networkName: string;
  runtimeContext: RuntimeContext;
  runId: string;
  routingAgent: Agent;
  routingAgentOptions?: AgentExecutionOptions<OUTPUT, STRUCTURED_OUTPUT, FORMAT>;
  generateId: () => string;
  maxIterations: number;
  threadId?: string;
  resourceId?: string;
  messages: MessageListInput;
}) {
  const { networkWorkflow } = await createNetworkLoop({
    networkName,
    runtimeContext,
    runId,
    routingAgent,
    routingAgentOptions,
    generateId,
  });

  const finalStep = createStep({
    id: 'final-step',
    inputSchema: networkWorkflow.outputSchema,
    outputSchema: networkWorkflow.outputSchema,
    execute: async ({ inputData }) => {
      if (maxIterations && inputData.iteration >= maxIterations) {
        return {
          ...inputData,
          completionReason: `Max iterations reached: ${maxIterations}`,
        };
      }

      return inputData;
    },
  });

  const mainWorkflow = createWorkflow({
    id: 'Agent-Loop-Main-Workflow',
    inputSchema: z.object({
      iteration: z.number(),
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      result: z.string().optional(),
      threadId: z.string().optional(),
      threadResourceId: z.string().optional(),
      isOneOff: z.boolean(),
      verboseIntrospection: z.boolean(),
    }),
    outputSchema: z.object({
      task: z.string(),
      resourceId: z.string(),
      resourceType: RESOURCE_TYPES,
      prompt: z.string(),
      result: z.string(),
      isComplete: z.boolean().optional(),
      completionReason: z.string().optional(),
      iteration: z.number(),
    }),
  })
    .dountil(networkWorkflow, async ({ inputData }) => {
      return inputData.isComplete || (maxIterations && inputData.iteration >= maxIterations);
    })
    .then(finalStep)
    .commit();

  const run = mainWorkflow.createRun({
    runId,
  });

  const { thread } = await prepareMemoryStep({
    runtimeContext: runtimeContext,
    threadId: threadId || run.runId,
    resourceId: resourceId || networkName,
    messages,
    routingAgent,
    generateId,
  });

  const task = getLastMessage(messages);

  return {
    get fullStream() {
      return run.streamVNext({
        inputData: {
          task,
          resourceId: '',
          resourceType: 'none',
          iteration: 0,
          threadResourceId: thread?.resourceId,
          threadId: thread?.id,
          isOneOff: false,
          verboseIntrospection: true,
        },
      });
    },
  };
}
