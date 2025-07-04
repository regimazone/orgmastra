import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { prompt } from "../prompts";

export const promptAgent = new Agent({
    name: 'promptAgent',
    description: 'A agent that can use prompts',
    model: openai.responses('gpt-4o'),
    instructions: async ({ runtimeContext }) => {
        const p = await prompt.prompt('abhiPrompt', { name: 'abhi', type: 'test' })
        console.log(p, 'p')
        if (!p) {
            return 'No prompt found'
        }
        return p
    },
})  