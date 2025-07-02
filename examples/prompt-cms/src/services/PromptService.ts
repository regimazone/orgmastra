import { PromptRepository } from '../models/PromptRepository.js';
import type {
  CreatePrompt,
  UpdatePrompt,
  CreateVersion,
  ExecutePrompt,
  Prompt,
  PromptVersion,
  PromptExecution,
  PromptWithVersions,
  PromptStats,
} from '../types/index.js';

export class PromptService {
  private repository: PromptRepository;

  constructor() {
    this.repository = new PromptRepository();
  }

  // Prompt management
  async createPrompt(data: CreatePrompt, createdBy?: string): Promise<Prompt> {
    // Check if prompt with same name already exists
    const existing = await this.repository.getPromptByName(data.name);
    if (existing) {
      throw new Error(`Prompt with name "${data.name}" already exists`);
    }

    return this.repository.createPrompt(data, createdBy);
  }

  async getPrompt(id: string): Promise<PromptWithVersions | null> {
    return this.repository.getPromptWithVersions(id);
  }

  async getPromptByName(name: string): Promise<Prompt | null> {
    return this.repository.getPromptByName(name);
  }

  async getAllPrompts(activeOnly: boolean = false): Promise<Prompt[]> {
    return this.repository.getAllPrompts(activeOnly);
  }

  async updatePrompt(id: string, data: UpdatePrompt): Promise<Prompt | null> {
    const prompt = await this.repository.getPromptById(id);
    if (!prompt) {
      throw new Error(`Prompt with id "${id}" not found`);
    }

    // Check if name is being changed and if new name already exists
    if (data.name && data.name !== prompt.name) {
      const existing = await this.repository.getPromptByName(data.name);
      if (existing) {
        throw new Error(`Prompt with name "${data.name}" already exists`);
      }
    }

    return this.repository.updatePrompt(id, data);
  }

  async deletePrompt(id: string): Promise<boolean> {
    const prompt = await this.repository.getPromptById(id);
    if (!prompt) {
      throw new Error(`Prompt with id "${id}" not found`);
    }

    return this.repository.deletePrompt(id);
  }

  // Version management
  async createVersion(promptId: string, data: CreateVersion, createdBy?: string): Promise<PromptVersion> {
    const prompt = await this.repository.getPromptById(promptId);
    if (!prompt) {
      throw new Error(`Prompt with id "${promptId}" not found`);
    }

    // Extract variables from content if not provided
    if (!data.variables || data.variables.length === 0) {
      data.variables = this.extractVariables(data.content);
    }

    return this.repository.createVersion(promptId, data, createdBy);
  }

  async getVersions(promptId: string): Promise<PromptVersion[]> {
    return this.repository.getVersionsByPromptId(promptId);
  }

  async getVersion(versionId: string): Promise<PromptVersion | null> {
    return this.repository.getVersionById(versionId);
  }

  async publishVersion(versionId: string): Promise<boolean> {
    const version = await this.repository.getVersionById(versionId);
    if (!version) {
      throw new Error(`Version with id "${versionId}" not found`);
    }

    return this.repository.publishVersion(versionId);
  }

  // Prompt execution
  async executePrompt(
    data: ExecutePrompt,
    llmGenerate: (prompt: string) => Promise<string>,
    model?: string,
  ): Promise<{ result: string; execution: PromptExecution }> {
    const startTime = Date.now();

    try {
      // Get the prompt
      const prompt = await this.repository.getPromptById(data.promptId);
      if (!prompt) {
        throw new Error(`Prompt with id "${data.promptId}" not found`);
      }

      // Get the version to execute
      let version: PromptVersion | null;
      if (data.version) {
        version = await this.repository.getVersionByPromptAndVersion(data.promptId, data.version);
      } else {
        version = await this.repository.getPublishedVersion(data.promptId);
      }

      if (!version) {
        throw new Error(
          `No ${data.version ? `version "${data.version}"` : 'published version'} found for prompt "${prompt.name}"`,
        );
      }

      // Replace variables in the prompt content
      const processedContent = this.replaceVariables(version.content, data.variables);

      // Execute the prompt using the provided LLM function
      const result = await llmGenerate(processedContent);
      const duration = Date.now() - startTime;

      // Record the execution
      const execution = await this.repository.recordExecution({
        promptVersionId: version.id,
        input: data.variables,
        output: result,
        model: model || data.model,
        duration,
        success: true,
      });

      return { result, execution };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Try to record failed execution if we have a version
      try {
        const prompt = await this.repository.getPromptById(data.promptId);
        if (prompt) {
          let version: PromptVersion | null;
          if (data.version) {
            version = await this.repository.getVersionByPromptAndVersion(data.promptId, data.version);
          } else {
            version = await this.repository.getPublishedVersion(data.promptId);
          }

          if (version) {
            await this.repository.recordExecution({
              promptVersionId: version.id,
              input: data.variables,
              output: '',
              model: model || data.model,
              duration,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (recordError) {
        console.error('Failed to record execution error:', recordError);
      }

      throw error;
    }
  }

  // Analytics and stats
  async getPromptStats(): Promise<PromptStats> {
    return this.repository.getStats();
  }

  async getExecutionHistory(versionId: string, limit: number = 50): Promise<PromptExecution[]> {
    return this.repository.getExecutionsByVersionId(versionId, limit);
  }

  // Search and filtering
  async searchPrompts(query: string, category?: string, tags?: string[]): Promise<Prompt[]> {
    const allPrompts = await this.repository.getAllPrompts(true);

    return allPrompts.filter(prompt => {
      // Text search in name and description
      const textMatch =
        !query ||
        prompt.name.toLowerCase().includes(query.toLowerCase()) ||
        prompt.description?.toLowerCase().includes(query.toLowerCase());

      // Category filter
      const categoryMatch = !category || prompt.category === category;

      // Tags filter
      const tagsMatch = !tags || tags.length === 0 || tags.some(tag => prompt.tags.includes(tag));

      return textMatch && categoryMatch && tagsMatch;
    });
  }

  async getCategories(): Promise<string[]> {
    const prompts = await this.repository.getAllPrompts();
    const categories = new Set<string>();

    prompts.forEach(prompt => {
      if (prompt.category) {
        categories.add(prompt.category);
      }
    });

    return Array.from(categories).sort();
  }

  async getAllTags(): Promise<string[]> {
    const prompts = await this.repository.getAllPrompts();
    const tags = new Set<string>();

    prompts.forEach(prompt => {
      prompt.tags.forEach(tag => tags.add(tag));
    });

    return Array.from(tags).sort();
  }

  // Utility methods
  private extractVariables(content: string): string[] {
    // Extract variables in the format {{variable_name}}
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;

    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  private replaceVariables(content: string, variables: Record<string, any>): string {
    let processedContent = content;

    // Replace variables in the format {{variable_name}}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processedContent = processedContent.replace(regex, String(value));
    });

    return processedContent;
  }

  // Template methods for common prompt patterns
  async createSystemPrompt(
    name: string,
    role: string,
    instructions: string,
    constraints?: string[],
    examples?: Array<{ input: string; output: string }>,
    createdBy?: string,
  ): Promise<Prompt> {
    let content = `You are ${role}.\n\n${instructions}`;

    if (constraints && constraints.length > 0) {
      content += '\n\nConstraints:\n' + constraints.map(c => `- ${c}`).join('\n');
    }

    if (examples && examples.length > 0) {
      content += '\n\nExamples:\n';
      examples.forEach((example, index) => {
        content += `\nExample ${index + 1}:\nInput: ${example.input}\nOutput: ${example.output}\n`;
      });
    }

    content += '\n\nInput: {{input}}';

    return this.createPrompt(
      {
        name,
        description: `System prompt for ${role}`,
        category: 'system',
        tags: ['system', 'template'],
        content,
        variables: ['input'],
      },
      createdBy,
    );
  }

  async createChatPrompt(
    name: string,
    systemMessage: string,
    userMessageTemplate: string,
    createdBy?: string,
  ): Promise<Prompt> {
    const content = `System: ${systemMessage}\n\nUser: ${userMessageTemplate}`;

    return this.createPrompt(
      {
        name,
        description: 'Chat prompt template',
        category: 'chat',
        tags: ['chat', 'conversation'],
        content,
        variables: this.extractVariables(userMessageTemplate),
      },
      createdBy,
    );
  }
}
