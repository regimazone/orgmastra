import { MastraBase } from '../base';
import type { IMastraLogger } from '../logger';
import type { MastraStorage } from '../storage';
import type {
  PromptTemplate,
  CreatePromptArgs,
  UpdatePromptArgs,
  RenderPromptArgs,
  GetPromptsOptions,
  RenderedPrompt,
} from './types';

export class MastraPrompts extends MastraBase {
  private storage: MastraStorage;

  constructor({ storage, logger }: { storage: MastraStorage; logger?: IMastraLogger }) {
    super({
      component: 'STORAGE',
      name: 'MastraPrompts',
    });

    this.storage = storage;
    if (logger) {
      this.__setLogger(logger);
    }
  }

  /**
   * Create a new prompt template
   */
  async create(args: CreatePromptArgs): Promise<PromptTemplate> {
    const id = `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const promptData = {
      ...args,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.logger.debug('Creating prompt', { name: args.name, id });

    const savedPrompt = await this.storage.savePrompt(promptData);
    return savedPrompt;
  }

  /**
   * Update an existing prompt template
   */
  async update(args: UpdatePromptArgs): Promise<PromptTemplate> {
    this.logger.debug('Updating prompt', { id: args.id });

    const updatedPrompt = await this.storage.updatePrompt(args);
    return updatedPrompt;
  }

  /**
   * Get a prompt template by ID
   */
  async getById(id: string): Promise<PromptTemplate | null> {
    this.logger.debug('Getting prompt by ID', { id });

    const prompt = await this.storage.getPromptById({ id });
    return prompt;
  }

  /**
   * Get a prompt template by name
   */
  async getByName(name: string, resourceId?: string): Promise<PromptTemplate | null> {
    this.logger.debug('Getting prompt by name', { name, resourceId });

    const prompt = await this.storage.getPromptByName({ name, resourceId });
    return prompt;
  }

  /**
   * Get all prompt templates with optional filtering
   */
  async getAll(options?: GetPromptsOptions): Promise<PromptTemplate[]> {
    this.logger.debug('Getting all prompts', { options });

    const prompts = await this.storage.getPrompts(options);
    return prompts;
  }

  /**
   * Delete a prompt template
   */
  async delete(id: string): Promise<void> {
    this.logger.debug('Deleting prompt', { id });

    await this.storage.deletePrompt({ id });
  }

  /**
  +   * Render a prompt template with variables
     */
  async render(args: RenderPromptArgs): Promise<string> {
    const { name, variables = {}, resourceId } = args;

    this.logger.debug('Rendering prompt', { name, variables, resourceId });

    // Get the prompt template
    const prompt = await this.getByName(name, resourceId);
    if (!prompt) {
      throw new Error(`Prompt template '${name}' not found`);
    }

    // Replace template variables
    let renderedContent = prompt.content;

    // Replace {{variable}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      renderedContent = renderedContent.replaceAll(placeholder, String(value));
    }

    // Check for unreplaced variables
    const unreplacedVariables = this.extractVariables(renderedContent);
    if (unreplacedVariables.length > 0) {
      this.logger.warn('Unreplaced variables found in prompt', {
        name,
        unreplacedVariables,
      });
    }

    return renderedContent;
  }

  /**
   * Get a rendered prompt with metadata
   */
  async getRenderResult(args: RenderPromptArgs): Promise<RenderedPrompt> {
    const { name, variables = {} } = args;

    const content = await this.render(args);

    return {
      name,
      content,
      variables,
    };
  }

  /**
   * Extract variable placeholders from a template string
   */
  private extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      variables.push(match[1]);
    }

    return variables;
  }

  /**
   * Get all variables used in a prompt template
   */
  async getPromptVariables(name: string, resourceId?: string): Promise<string[]> {
    const prompt = await this.getByName(name, resourceId);
    if (!prompt) {
      throw new Error(`Prompt template '${name}' not found`);
    }

    return this.extractVariables(prompt.content);
  }

  /**
   * Validate that all required variables are provided
   */
  async validatePrompt(args: RenderPromptArgs): Promise<{ isValid: boolean; missingVariables: string[] }> {
    const { name, variables = {}, resourceId } = args;

    const requiredVariables = await this.getPromptVariables(name, resourceId);
    const providedVariables = Object.keys(variables);
    const missingVariables = requiredVariables.filter(variable => !providedVariables.includes(variable));

    return {
      isValid: missingVariables.length === 0,
      missingVariables,
    };
  }
}
