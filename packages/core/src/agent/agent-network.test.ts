import { openai } from '@ai-sdk/openai-v5';
import { describe, it } from 'vitest';
import { z } from 'zod';
import { RuntimeContext } from '../runtime-context';
import { createStep, createWorkflow } from '../workflows';
import { MockMemory } from './test-utils';
import { Agent } from './index';

describe('Agent - network', () => {
  it.skip('should create a new agent network', async () => {
    const memory = new MockMemory();

    const agentStep1 = createStep({
      id: 'agent-step',
      description: 'This step is used to do research',
      inputSchema: z.object({
        city: z.string().describe('The city to research'),
      }),
      outputSchema: z.object({
        text: z.string(),
      }),
      execute: async ({ inputData }) => {
        const resp = await agent1.generate(inputData.city, {
          output: z.object({
            text: z.string(),
          }),
        });

        return { text: resp.object.text };
      },
    });

    const agentStep2 = createStep({
      id: 'agent-step',
      description: 'This step is used to do text synthesis.',
      inputSchema: z.object({
        text: z.string().describe('The city to research'),
      }),
      outputSchema: z.object({
        text: z.string(),
      }),
      execute: async ({ inputData }) => {
        const resp = await agent2.generate(inputData.text, {
          output: z.object({
            text: z.string(),
          }),
        });

        return { text: resp.object.text };
      },
    });

    const workflow1 = createWorkflow({
      id: 'workflow1',
      description:
        'This workflow is perfect for researching a specific city. It should be used when you have a city in mind to research.',
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
        'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Writes reports in full paragraphs. Should be used to synthesize text from different sources together as a final report.',
      instructions:
        'This agent is used to do text synthesis on researched material. Write a full report based on the researched material. Do not use bullet points. Write full paragraphs. There should not be a single bullet point in the final report.',
      model: openai('gpt-4o'),
    });

    const network = new NewAgentNetwork({
      id: 'test-network',
      name: 'Test Network',
      instructions:
        'You are a network of writers and researchers. The user will ask you to research a topic. You always need to answer with a full report. Bullet points are NOT a full report. WRITE FULL PARAGRAPHS like this is a blog post or something similar. You should not rely on partial information.',
      model: openai('gpt-4o'),
      agents: {
        agent1,
        agent2,
      },
      workflows: {
        workflow1,
      },
      memory: memory,
    });

    const runtimeContext = new RuntimeContext();

    console.log(
      await network.loop(
        'What are the biggest cities in France? Give me 3. How are they like? Find cities, then do thorough research on each city, and give me a final full report synthesizing all that information. Make sure to use an agent for synthesis.',
        { runtimeContext, maxIterations: 10 },
      ),
    );
  });

  it.only('LOOP - should create a new agent network single call', async () => {
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
        const resp = await agent1.generate(inputData.city, {
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
        const resp = await agent2.generate(inputData.text, {
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
      memory: memory as any,
    });

    const runtimeContext = new RuntimeContext();

    const anStream = await network.loop('What are the biggest cities in France? How are they like?', {
      runtimeContext,
    });

    for await (const chunk of anStream.fullStream) {
      console.log(chunk);
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
