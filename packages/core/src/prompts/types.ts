export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  resourceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePromptArgs {
  name: string;
  content: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  resourceId?: string;
}

export interface UpdatePromptArgs {
  id: string;
  name?: string;
  content?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface RenderPromptArgs {
  name: string;
  variables?: Record<string, string | number>;
  resourceId?: string;
}

export interface GetPromptsOptions {
  resourceId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface RenderedPrompt {
  name: string;
  content: string;
  variables: Record<string, string | number>;
}