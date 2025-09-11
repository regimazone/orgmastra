import { openai } from '@ai-sdk/openai';
import { AISpan, AISpanType } from '@mastra/core/ai-tracing';
import { MastraLLMV1 } from '@mastra/core/llm/model';
import { createTool } from '@mastra/core/tools';
import { LanguageModel } from 'ai';
import { z } from 'zod';

export const cookingTool = createTool({
  id: 'cooking-tool',
  description: 'My cooking tool description',
  inputSchema: z.object({
    ingredient: z.string(),
  }),
  execute: async ({ context, tracingContext }, options) => {
    console.log('tracingContext', tracingContext);
    console.log('tracingContext.currentSpan', tracingContext?.currentSpan);
    const newSpan = tracingContext?.currentSpan?.createChildSpan({
      type: AISpanType.GENERIC,
      name: 'booya',
      input: 'input',
    });
    console.log('My cooking tool is running!', context.ingredient);
    if (options?.toolCallId) {
      console.log('Cooking tool call ID:', options.toolCallId);
    }

    new Promise(resolve => setTimeout(resolve, 200));
    newSpan?.end({ output: 'output' });

    return 'My tool result';
  },
});

export const ian_tool = createTool({
  id: 'ian-tool',
  description: 'Fix Wrap Model',
  inputSchema: z.object({}),
  execute: async ({ mastra, runtimeContext, tracingContext }) => {
    const agent = mastra?.getAgent('chefAgentResponses');
    const llm = (await agent?.getLLM({
      runtimeContext,
      model: openai('gpt-4o-mini'),
    })) as MastraLLMV1;

    // Use Mastra LLM generate with structured output
    const result = await llm.generate('give me a random ingredient and amount for cooking with', {
      output: z.object({
        ingredient: z.string(),
        amount: z.string(),
      }),
      runtimeContext,
      agentAISpan: tracingContext.currentSpan as AISpan<AISpanType.AGENT_RUN>, // if i comment this line, it works fine
    });
    return result.object;
  },
});
