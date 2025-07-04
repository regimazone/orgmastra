import { MastraBase } from "../base";
import type { MastraStorage } from "../storage";
import { TABLE_PROMPTS } from "../storage";


export type SavePromptType = {
    id?: string
    name: string
    description: string
    content: string
    tags: string[]
    version: string
}

export class MastraPrompt extends MastraBase {
    storage: MastraStorage
    constructor({ storage }: { storage: MastraStorage }) {
        super({
            component: 'STORAGE',
            name: 'PROMPT',
        })
        this.storage = storage
    }

    async savePrompt(prompt: SavePromptType) {
        await this.storage.init();
        let hasPrompt = false
        try {
            const s = await this.storage.getPrompt(prompt.name)
            console.log(s, 's')
            hasPrompt = !!s
        } catch (error) {
            console.log(error, 'yoooo')
            hasPrompt = false
        }

        if (hasPrompt) {
            console.log('Prompt already exists')
            return
        }

        try {
            await this.storage.insert({
                tableName: TABLE_PROMPTS,
                record: {
                    ...prompt,
                    id: prompt.id || crypto.randomUUID(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            })
        } catch (error) {
            console.log(error, 'yoooo')
        }

    }

    async prompt(promptIdOrName: string, variables: Record<string, any>) {
        await this.storage.init()
        const p = await this.storage.getPrompt(promptIdOrName)
        console.log(p, 'p', variables)
        return renderTemplate(p?.content || '', variables)
    }
}

export function renderTemplate(template: string, params: Record<string, any> = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return params[key] !== undefined ? String(params[key]) : match;
    });
}
