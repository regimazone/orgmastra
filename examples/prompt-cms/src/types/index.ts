import { z } from 'zod';

// Base schemas
export const PromptSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().optional(),
});

export const PromptVersionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  version: z.string(),
  content: z.string().min(1, 'Content is required'),
  variables: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
  isPublished: z.boolean().default(false),
  createdAt: z.date(),
  createdBy: z.string().optional(),
});

export const PromptExecutionSchema = z.object({
  id: z.string(),
  promptVersionId: z.string(),
  input: z.record(z.string(), z.any()),
  output: z.string(),
  model: z.string().optional(),
  tokens: z.number().optional(),
  duration: z.number().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  executedAt: z.date(),
});

// Request/Response schemas
export const CreatePromptSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  content: z.string().min(1, 'Initial content is required'),
  variables: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const UpdatePromptSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const CreateVersionSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  variables: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
  version: z.string().optional(), // Auto-generated if not provided
});

export const ExecutePromptSchema = z.object({
  promptId: z.string(),
  version: z.string().optional(), // Use latest published if not specified
  variables: z.record(z.string(), z.any()).default({}),
  model: z.string().optional(),
});

// Type exports
export type Prompt = z.infer<typeof PromptSchema>;
export type PromptVersion = z.infer<typeof PromptVersionSchema>;
export type PromptExecution = z.infer<typeof PromptExecutionSchema>;
export type CreatePrompt = z.infer<typeof CreatePromptSchema>;
export type UpdatePrompt = z.infer<typeof UpdatePromptSchema>;
export type CreateVersion = z.infer<typeof CreateVersionSchema>;
export type ExecutePrompt = z.infer<typeof ExecutePromptSchema>;

// Additional utility types
export interface PromptWithVersions extends Prompt {
  versions: PromptVersion[];
  latestVersion?: PromptVersion;
  publishedVersion?: PromptVersion;
}

export interface PromptVersionWithExecutions extends PromptVersion {
  executions: PromptExecution[];
}

export interface PromptStats {
  totalPrompts: number;
  totalVersions: number;
  totalExecutions: number;
  recentExecutions: number;
}
