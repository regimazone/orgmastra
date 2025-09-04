import type { JSONSchema7 } from "json-schema";
import z from "zod";
import type { ZodSchema } from "zod";
import type { Agent, AgentExecutionOptions } from "../agent";
import type { MastraMessageV2, MessageListInput } from "../agent/message-list";
import type { RuntimeContext } from "../runtime-context";
import type { MastraModelOutput, OutputSchema } from "../stream";
import { createStep } from "../workflows";
import { RESOURCE_TYPES } from "./types";
import { EMITTER_SYMBOL } from "../workflows/constants";

export async function networkLoop<
    OUTPUT extends OutputSchema | undefined = undefined,
    STRUCTURED_OUTPUT extends ZodSchema | JSONSchema7 | undefined = undefined,
    FORMAT extends 'aisdk' | 'mastra' | undefined = undefined,
>({
    networkName,
    runtimeContext,
    runId,
    routingAgent,
}: {
    networkName: string;
    runtimeContext: RuntimeContext;
    runId: string;
    routingAgent: Agent;
    routingAgentOptions: AgentExecutionOptions<OUTPUT, STRUCTURED_OUTPUT, FORMAT>;
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

            const model = await routingAgent.getModel();

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

                if (model.specificationVersion === 'v2') {
                    completionResult = await routingAgent.generateVNext([{ role: 'assistant', content: completionPrompt }], {
                        output: completionSchema,
                        threadId: initData?.threadId ?? runId,
                        resourceId: initData?.threadResourceId ?? networkName,
                        runtimeContext: runtimeContext,
                    });
                } else {
                    completionResult = await routingAgent.generate([{ role: 'assistant', content: completionPrompt }], {
                        output: completionSchema,
                        threadId: initData?.threadId ?? runId,
                        resourceId: initData?.threadResourceId ?? networkName,
                        runtimeContext: runtimeContext,
                    });
                }

                if (completionResult.object.isComplete) {
                    return {
                        task: inputData.task,
                        resourceId: '',
                        resourceType: 'none' as z.infer<typeof RESOURCE_TYPES>,
                        prompt: '',
                        result: completionResult.object.finalResult,
                        isComplete: true,
                        selectionReason: completionResult.object.completionReason,
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
                    ${completionResult ? `\n\n${completionResult.object.finalResult}` : ''}
  
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

            if (model.specificationVersion === 'v2') {
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
            } else {
                throw new Error('Unsupported model version');
            }
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

            const model = await agent.getModel();


            if (model.specificationVersion === 'v2') {
                const result = await agent.streamVNext(inputData.prompt, {
                    // resourceId: inputData.resourceId,
                    // threadId: inputData.threadId,
                    runtimeContext: runtimeContext,
                    onFinish: (res) => {
                        streamPromise.resolve(result.text);
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
            } else {
                throw new Error('Unsupported model version');
            }

            const finalResult = await streamPromise.promise;

            const memory = await routingAgent.getMemory({ runtimeContext: runtimeContext });
            const initData = await getInitData();
            await memory?.saveMessages({
                messages: [
                    {
                        id: this.#mastra?.generateId() || randomUUID(),
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

}