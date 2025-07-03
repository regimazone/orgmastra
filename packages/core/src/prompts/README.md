# Mastra Prompts

The Mastra Prompts module allows you to store, manage, and render prompt templates with variable substitution.

## Features

- Store and retrieve prompt templates
- Template variable substitution using `{{variable}}` syntax
- Support for resource-scoped prompts
- Metadata and tagging support
- Variable validation and extraction

## Usage

### Basic Setup

```typescript
import { Mastra } from '@mastra/core';
import { SomeStorageAdapter } from '@mastra/some-storage';

const mastra = new Mastra({
  storage: new SomeStorageAdapter(),
});

const prompts = mastra.getPrompts();
```

### Creating Prompts

```typescript
// Create a simple prompt
const prompt = await prompts.create({
  name: 'greeting',
  content: 'Hello {{name}}! Welcome to {{platform}}.',
  description: 'A greeting prompt with name and platform variables',
  tags: ['greeting', 'welcome'],
});
```

### Rendering Prompts

```typescript
// Render a prompt with variables
const rendered = await prompts.render({
  name: 'greeting',
  variables: {
    name: 'John',
    platform: 'Mastra',
  },
});

console.log(rendered); // "Hello John! Welcome to Mastra."
```

### Managing Prompts

```typescript
// Get a prompt by name
const prompt = await prompts.getByName('greeting');

// Get all prompts
const allPrompts = await prompts.getAll();

// Update a prompt
await prompts.update({
  id: prompt.id,
  content: 'Hi {{name}}! Welcome to {{platform}}. How can I help you today?',
});

// Delete a prompt
await prompts.delete(prompt.id);
```

### Variable Management

```typescript
// Get all variables used in a prompt
const variables = await prompts.getPromptVariables('greeting');
console.log(variables); // ['name', 'platform']

// Validate that all required variables are provided
const validation = await prompts.validatePrompt({
  name: 'greeting',
  variables: { name: 'John' }, // missing 'platform'
});

console.log(validation.isValid); // false
console.log(validation.missingVariables); // ['platform']
```

### Resource-Scoped Prompts

```typescript
// Create a prompt for a specific resource
await prompts.create({
  name: 'user-greeting',
  content: 'Hello {{name}}! Your account type is {{accountType}}.',
  resourceId: 'user-123',
});

// Render a resource-scoped prompt
const rendered = await prompts.render({
  name: 'user-greeting',
  resourceId: 'user-123',
  variables: {
    name: 'Alice',
    accountType: 'Premium',
  },
});
```

## API Reference

### MastraPrompts

#### Methods

- `create(args: CreatePromptArgs): Promise<PromptTemplate>`
- `update(args: UpdatePromptArgs): Promise<PromptTemplate>`
- `getById(id: string): Promise<PromptTemplate | null>`
- `getByName(name: string, resourceId?: string): Promise<PromptTemplate | null>`
- `getAll(options?: GetPromptsOptions): Promise<PromptTemplate[]>`
- `delete(id: string): Promise<void>`
- `render(args: RenderPromptArgs): Promise<string>`
- `getRenderResult(args: RenderPromptArgs): Promise<RenderedPrompt>`
- `getPromptVariables(name: string, resourceId?: string): Promise<string[]>`
- `validatePrompt(args: RenderPromptArgs): Promise<{ isValid: boolean; missingVariables: string[] }>`

### Types

```typescript
interface PromptTemplate {
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

interface CreatePromptArgs {
  name: string;
  content: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  resourceId?: string;
}

interface RenderPromptArgs {
  name: string;
  variables?: Record<string, string | number>;
  resourceId?: string;
}
```

## Storage Requirements

The prompts module requires a storage adapter that implements the prompt-related methods in the `MastraStorage` abstract class:

- `savePrompt(args: SavePromptArgs): Promise<PromptType>`
- `updatePrompt(args: UpdatePromptArgs): Promise<PromptType>`
- `getPromptById(args: { id: string }): Promise<PromptType | null>`
- `getPromptByName(args: GetPromptByNameArgs): Promise<PromptType | null>`
- `getPrompts(args?: GetPromptsArgs): Promise<PromptType[]>`
- `deletePrompt(args: { id: string }): Promise<void>`

The storage adapter will automatically create the `mastra_prompts` table with the appropriate schema.