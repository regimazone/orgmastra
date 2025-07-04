import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { prompt } from "../prompts";

const makePromptStep = createStep({
    id: 'makePrompt',
    description: 'This is a test prompt',
    inputSchema: z.object({
    }),
    outputSchema: z.object({
        success: z.boolean(),
    }),
    execute: async () => {
        await prompt.savePrompt({
            name: 'abhiPrompt',
            description: 'This is a test prompt',
            content: 'Hello, {{name}}. You are a {{type}} agent. I am the man.',
            tags: ['test', 'prompt'],
            version: '1.0.0',
        })

        return {
            success: true,
        }
    }
})

const getPromptStep = createStep({
    id: 'getPrompt',
    description: 'This is a test prompt',
    inputSchema: z.object({
        success: z.boolean(),
    }),
    outputSchema: z.object({
        prompt: z.string(),
    }),
    execute: async () => {
        const p = await prompt.prompt('abhiPrompt', { name: 'Abhi', type: 'test' })
        return {
            prompt: p,
        }
    }
})

export const promptWorkflow = createWorkflow({
    id: 'prompt',
    description: 'This is a test prompt',
    inputSchema: z.object({}),
    outputSchema: z.object({
        success: z.boolean(),
    }),
    steps: [
        makePromptStep
    ],
}).then(makePromptStep).then(getPromptStep).commit()