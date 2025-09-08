import { openai } from '@ai-sdk/openai-v5';
import { describe, it } from 'vitest';
import { z } from 'zod';
import { RuntimeContext } from '../runtime-context';
import { createTool } from '../tools';
import type { ChunkType } from '../workflows';
import { createStep, createWorkflow } from '../workflows';
import { MockMemory } from './test-utils';
import { Agent } from './index';

describe('Agent - network', () => {
  const memory = new MockMemory();

  const agent1 = new Agent({
    name: 'agent1',
    instructions:
      'This agent is used to do research, but not create full responses. Answer in bullet points only and be concise.',
    description:
      'This agent is used to do research, but not create full responses. Answer in bullet points only and be concise.',
    model: openai('gpt-4o'),
  });

  const agent2 = new Agent({
    name: 'agent2',
    description:
      'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report. You write articles.',
    instructions:
      'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report. You write articles. [IMPORTANT] Make sure to mention information that has been highlighted as relevant in message history.',
    model: openai('gpt-4o'),
  });

  const agentStep1 = createStep({
    id: 'agent-step',
    description: 'This step is used to do research and text synthesis.',
    inputSchema: z.object({
      city: z.string().describe('The city to research'),
    }),
    outputSchema: z.object({
      text: z.string(),
    }),
    execute: async ({ inputData }) => {
      const resp = await agent1.generateVNext(inputData.city, {
        output: z.object({
          text: z.string(),
        }),
      });

      return { text: resp.object.text };
    },
  });

  const agentStep2 = createStep({
    id: 'agent-step',
    description: 'This step is used to do research and text synthesis.',
    inputSchema: z.object({
      text: z.string().describe('The city to research'),
    }),
    outputSchema: z.object({
      text: z.string(),
    }),
    execute: async ({ inputData }) => {
      const resp = await agent2.generateVNext(inputData.text, {
        output: z.object({
          text: z.string(),
        }),
      });

      return { text: resp.object.text };
    },
  });

  const workflow1 = createWorkflow({
    id: 'workflow1',
    description: 'This workflow is perfect for researching a specific city.',
    steps: [],
    inputSchema: z.object({
      city: z.string(),
    }),
    outputSchema: z.object({
      text: z.string(),
    }),
  })
    .then(agentStep1)
    .then(agentStep2)
    .commit();

  const tool = createTool({
    id: 'tool1',
    description: 'This tool will tell you about "cool stuff"',
    inputSchema: z.object({
      howCool: z.string().describe('How cool is the stuff?'),
    }),
    outputSchema: z.object({
      text: z.string(),
    }),
    execute: async ({ context, ...rest }) => {
      await rest.writer?.write({
        type: 'my-custom-tool-payload',
        payload: {
          context,
        },
      });

      return { text: `This is a test tool. How cool is the stuff? ${context.howCool}` };
    },
  });

  const network = new Agent({
    id: 'test-network',
    name: 'Test Network',
    instructions:
      'You can research cities. You can also synthesize research material. You can also write a full report based on the researched material.',
    model: openai('gpt-4o'),
    agents: {
      agent1,
      agent2,
    },
    workflows: {
      workflow1,
    },
    tools: {
      tool,
    },
    memory: memory as any,
  });

  const runtimeContext = new RuntimeContext();

  function transformToNetworkChunk(chunk: ChunkType) {
    if (chunk.type === 'workflow-step-output') {
      const innerChunk = chunk.payload.output;
      const innerChunkType = innerChunk.payload.output;

      console.log(innerChunkType);

      return innerChunkType;
    }
  }

  it.only('LOOP - execute a single tool', async () => {
    const anStream = await network.loop('Execute tool1', {
      runtimeContext,
    });

    for await (const chunk of anStream) {
      transformToNetworkChunk(chunk);
    }
  });

  it('LOOP - execute a single agent', async () => {
    const anStream = await network.loop('Research dolphins', {
      runtimeContext,
    });

    for await (const chunk of anStream) {
      transformToNetworkChunk(chunk);
    }

    // console.log(
    //     await network.loop('What are the biggest cities in France? How are they like?', { runtimeContext }),
    // );
    // console.log(await network.generate('Tell me more about Paris', { runtimeContext }));
  });

  // it('should create a new agent network single call (streaming)', async () => {
  //     const memory = new MockMemory({
  //         name: 'test-memory',
  //     });

  //     const agent1 = new Agent({
  //         name: 'agent1',
  //         instructions:
  //             'This agent is used to do research, but not create full responses. Answer in bullet points only and be concise.',
  //         description:
  //             'This agent is used to do research, but not create full responses. Answer in bullet points only and be concise.',
  //         model: openai('gpt-4o'),
  //     });

  //     const agent2 = new Agent({
  //         name: 'agent2',
  //         description:
  //             'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report. You write articles.',
  //         instructions:
  //             'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report. You write articles. [IMPORTANT] Make sure to mention information that has been highlighted as relevant in message history.',
  //         model: openai('gpt-4o'),
  //     });

  //     const agentStep1 = createStep({
  //         id: 'agent-step',
  //         description: 'This step is used to do research and text synthesis.',
  //         inputSchema: z.object({
  //             city: z.string().describe('The city to research'),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //         execute: async ({ inputData }) => {
  //             const resp = await agent1.generate(inputData.city, {
  //                 output: z.object({
  //                     text: z.string(),
  //                 }),
  //             });

  //             return { text: resp.object.text };
  //         },
  //     });

  //     const agentStep2 = createStep({
  //         id: 'agent-step',
  //         description: 'This step is used to do research and text synthesis.',
  //         inputSchema: z.object({
  //             text: z.string().describe('The city to research'),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //         execute: async ({ inputData }) => {
  //             const resp = await agent2.generate(inputData.text, {
  //                 output: z.object({
  //                     text: z.string(),
  //                 }),
  //             });

  //             return { text: resp.object.text };
  //         },
  //     });

  //     const workflow1 = createWorkflow({
  //         id: 'workflow1',
  //         description: 'This workflow is perfect for researching a specific city.',
  //         steps: [],
  //         inputSchema: z.object({
  //             city: z.string(),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //     })
  //         .then(agentStep1)
  //         .then(agentStep2)
  //         .commit();

  //     const network = new NewAgentNetwork({
  //         id: 'test-network',
  //         name: 'Test Network',
  //         instructions:
  //             'You can research cities. You can also synthesize research material. You can also write a full report based on the researched material.',
  //         model: openai('gpt-4o'),
  //         agents: {
  //             agent1,
  //             agent2,
  //         },
  //         workflows: {
  //             workflow1,
  //         },
  //         defaultAgent: agent2,
  //         memory: memory,
  //     });

  //     const runtimeContext = new RuntimeContext();

  //     const anStream = await network.stream('Tell me about Europe, just 3 sentences about geography.', {
  //         runtimeContext,
  //     });

  //     for await (const chunk of anStream.stream) {
  //         console.log(chunk);
  //     }
  // });

  // it('should create a new agent network single call with tools', async () => {
  //     const memory = new MockMemory({
  //         name: 'test-memory',
  //     });

  //     const agent1 = new Agent({
  //         name: 'agent1',
  //         instructions:
  //             'This agent is used to do research, but not create full responses. Answer in bullet points only and be concise.',
  //         description:
  //             'This agent is used to do research, but not create full responses. Answer in bullet points only and be concise.',
  //         model: openai('gpt-4o'),
  //     });

  //     const agent2 = new Agent({
  //         name: 'agent2',
  //         description:
  //             'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report. You write articles.',
  //         instructions:
  //             'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report. You write articles. [IMPORTANT] Make sure to mention information that has been highlighted as relevant in message history.',
  //         model: openai('gpt-4o'),
  //     });

  //     const agentStep1 = createStep({
  //         id: 'agent-step',
  //         description: 'This step is used to do research and text synthesis.',
  //         inputSchema: z.object({
  //             city: z.string().describe('The city to research'),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //         execute: async ({ inputData }) => {
  //             const resp = await agent1.generate(inputData.city, {
  //                 output: z.object({
  //                     text: z.string(),
  //                 }),
  //             });

  //             return { text: resp.object.text };
  //         },
  //     });

  //     const agentStep2 = createStep({
  //         id: 'agent-step',
  //         description: 'This step is used to do research and text synthesis.',
  //         inputSchema: z.object({
  //             text: z.string().describe('The city to research'),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //         execute: async ({ inputData }) => {
  //             const resp = await agent2.generate(inputData.text, {
  //                 output: z.object({
  //                     text: z.string(),
  //                 }),
  //             });

  //             return { text: resp.object.text };
  //         },
  //     });

  //     const workflow1 = createWorkflow({
  //         id: 'workflow1',
  //         description: 'This workflow is perfect for researching a specific city.',
  //         steps: [],
  //         inputSchema: z.object({
  //             city: z.string(),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //     })
  //         .then(agentStep1)
  //         .then(agentStep2)
  //         .commit();

  //     const tool1 = createTool({
  //         id: 'tool1',
  //         description: 'This tool will tell you about "cool stuff"',
  //         inputSchema: z.object({
  //             howCool: z.string().describe('How cool is the stuff?'),
  //         }),
  //         outputSchema: z.object({
  //             text: z.string(),
  //         }),
  //         execute: async ({ context }) => {
  //             return { text: `This is a test tool. How cool is the stuff? ${context.howCool}` };
  //         },
  //     });

  //     const network = new NewAgentNetwork({
  //         id: 'test-network',
  //         name: 'Test Network',
  //         instructions:
  //             'You can research cities. You can also synthesize research material. You can also write a full report based on the researched material.',
  //         model: openai('gpt-4o'),
  //         agents: {
  //             agent1,
  //             agent2,
  //         },
  //         workflows: {
  //             workflow1,
  //         },
  //         tools: {
  //             tool1,
  //         },
  //         memory: memory,
  //     });

  //     const runtimeContext = new RuntimeContext();

  //     console.log(
  //         await network.generate('How cool is the very very verey cool stuff?', {
  //             runtimeContext,
  //         }),
  //     );
  // });
}, 120e3);
