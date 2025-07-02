import { createTool } from '@mastra/core';
import { z } from 'zod';
import { PromptService } from '../../services/PromptService.js';
import { CreatePromptSchema, UpdatePromptSchema, CreateVersionSchema, ExecutePromptSchema } from '../../types/index.js';

const promptService = new PromptService();

// Tool to create a new prompt
export const createPromptTool = createTool({
  id: 'create_prompt',
  description: 'Create a new prompt in the CMS',
  inputSchema: CreatePromptSchema.extend({
    createdBy: z.string().optional(),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      const prompt = await promptService.createPrompt(data, data.createdBy);
      return {
        success: true,
        prompt,
        message: `Prompt "${prompt.name}" created successfully with initial version 1.0.0`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to execute a prompt
export const executePromptTool = createTool({
  id: 'execute_prompt',
  description: 'Execute a prompt with variables and return the result',
  inputSchema: ExecutePromptSchema,
  execute: async ({ context, runId }, data) => {
    try {
      // Get the LLM generate function from context (this would be passed by the agent)
      const llmGenerate = context?.llmGenerate as ((prompt: string) => Promise<string>) | undefined;

      if (!llmGenerate) {
        return {
          success: false,
          error: 'LLM generate function not available in context',
        };
      }

      const result = await promptService.executePrompt(data, llmGenerate, data.model);

      return {
        success: true,
        result: result.result,
        execution: result.execution,
        message: `Prompt executed successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to get a prompt by name
export const getPromptTool = createTool({
  id: 'get_prompt',
  description: 'Get a prompt by name or ID with all its versions',
  inputSchema: z.object({
    identifier: z.string().describe('Prompt name or ID'),
    byName: z.boolean().default(false).describe('Whether to search by name instead of ID'),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      let prompt;

      if (data.byName) {
        const basicPrompt = await promptService.getPromptByName(data.identifier);
        if (basicPrompt) {
          prompt = await promptService.getPrompt(basicPrompt.id);
        }
      } else {
        prompt = await promptService.getPrompt(data.identifier);
      }

      if (!prompt) {
        return {
          success: false,
          error: `Prompt with ${data.byName ? 'name' : 'ID'} "${data.identifier}" not found`,
        };
      }

      return {
        success: true,
        prompt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to list all prompts
export const listPromptsTool = createTool({
  id: 'list_prompts',
  description: 'List all prompts with optional filtering',
  inputSchema: z.object({
    activeOnly: z.boolean().default(true).describe('Only return active prompts'),
    category: z.string().optional().describe('Filter by category'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    search: z.string().optional().describe('Search in prompt names and descriptions'),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      let prompts;

      if (data.search || data.category || data.tags) {
        prompts = await promptService.searchPrompts(data.search || '', data.category, data.tags);
      } else {
        prompts = await promptService.getAllPrompts(data.activeOnly);
      }

      return {
        success: true,
        prompts,
        count: prompts.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to create a new version of a prompt
export const createVersionTool = createTool({
  id: 'create_version',
  description: 'Create a new version of an existing prompt',
  inputSchema: z.object({
    promptId: z.string().describe('ID of the prompt'),
    version: CreateVersionSchema,
    createdBy: z.string().optional(),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      const version = await promptService.createVersion(data.promptId, data.version, data.createdBy);

      return {
        success: true,
        version,
        message: `Version ${version.version} created successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to publish a version
export const publishVersionTool = createTool({
  id: 'publish_version',
  description: 'Publish a specific version of a prompt',
  inputSchema: z.object({
    versionId: z.string().describe('ID of the version to publish'),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      const success = await promptService.publishVersion(data.versionId);

      if (!success) {
        return {
          success: false,
          error: 'Failed to publish version',
        };
      }

      return {
        success: true,
        message: 'Version published successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to get prompt statistics
export const getPromptStatsTool = createTool({
  id: 'get_prompt_stats',
  description: 'Get statistics about the prompt CMS',
  inputSchema: z.object({}),
  execute: async ({ context, runId }, data) => {
    try {
      const stats = await promptService.getPromptStats();
      const categories = await promptService.getCategories();
      const tags = await promptService.getAllTags();

      return {
        success: true,
        stats,
        categories,
        tags,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to get execution history
export const getExecutionHistoryTool = createTool({
  id: 'get_execution_history',
  description: 'Get execution history for a specific prompt version',
  inputSchema: z.object({
    versionId: z.string().describe('ID of the prompt version'),
    limit: z.number().default(50).describe('Maximum number of executions to return'),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      const executions = await promptService.getExecutionHistory(data.versionId, data.limit);

      return {
        success: true,
        executions,
        count: executions.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to create a system prompt using template
export const createSystemPromptTool = createTool({
  id: 'create_system_prompt',
  description: 'Create a system prompt using a template',
  inputSchema: z.object({
    name: z.string().describe('Name of the prompt'),
    role: z.string().describe('The role the AI should assume'),
    instructions: z.string().describe('Instructions for the AI'),
    constraints: z.array(z.string()).optional().describe('Constraints or rules'),
    examples: z
      .array(
        z.object({
          input: z.string(),
          output: z.string(),
        }),
      )
      .optional()
      .describe('Example input/output pairs'),
    createdBy: z.string().optional(),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      const prompt = await promptService.createSystemPrompt(
        data.name,
        data.role,
        data.instructions,
        data.constraints,
        data.examples,
        data.createdBy,
      );

      return {
        success: true,
        prompt,
        message: `System prompt "${prompt.name}" created successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Tool to create a chat prompt using template
export const createChatPromptTool = createTool({
  id: 'create_chat_prompt',
  description: 'Create a chat prompt using a template',
  inputSchema: z.object({
    name: z.string().describe('Name of the prompt'),
    systemMessage: z.string().describe('System message for the chat'),
    userMessageTemplate: z.string().describe('Template for user messages with variables'),
    createdBy: z.string().optional(),
  }),
  execute: async ({ context, runId }, data) => {
    try {
      const prompt = await promptService.createChatPrompt(
        data.name,
        data.systemMessage,
        data.userMessageTemplate,
        data.createdBy,
      );

      return {
        success: true,
        prompt,
        message: `Chat prompt "${prompt.name}" created successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Export all tools
export const promptTools = {
  createPromptTool,
  executePromptTool,
  getPromptTool,
  listPromptsTool,
  createVersionTool,
  publishVersionTool,
  getPromptStatsTool,
  getExecutionHistoryTool,
  createSystemPromptTool,
  createChatPromptTool,
};
