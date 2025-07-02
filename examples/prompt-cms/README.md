# Prompt CMS - AI Prompt Management System

A comprehensive Content Management System for AI prompts built with Mastra. This system allows you to store, version, organize, and execute AI prompts with full tracking and analytics.

## Features

### 🎯 Core Functionality

- **Prompt Management**: Create, update, and organize prompts with metadata
- **Version Control**: Full versioning system with publish/unpublish capabilities
- **Template System**: Pre-built templates for common prompt patterns
- **Execution Tracking**: Track all prompt executions with performance metrics
- **Search & Discovery**: Find prompts by name, category, tags, or content

### 🔧 Technical Features

- **Mastra Integration**: Built as a Mastra application with agents and tools
- **REST API**: Complete HTTP API for all operations
- **SQLite Database**: Lightweight, file-based storage with proper indexing
- **TypeScript**: Fully typed with Zod schemas for validation
- **Variable Support**: Dynamic variables in prompts using `{{variable}}` syntax

### 📊 Analytics & Insights

- **Usage Statistics**: Track prompt usage, executions, and performance
- **Execution History**: Detailed logs of all prompt executions
- **Performance Metrics**: Response times, token usage, success rates

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Installation

1. **Navigate to the prompt-cms directory:**

   ```bash
   cd examples/prompt-cms
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Set up environment variables:**

   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Add your API keys
   echo "OPENAI_API_KEY=your_openai_key_here" >> .env
   # or
   echo "ANTHROPIC_API_KEY=your_anthropic_key_here" >> .env
   ```

4. **Start the application:**
   ```bash
   pnpm dev
   ```

The application will start on `http://localhost:3000` and automatically create sample data.

## API Reference

### Base URL

```
http://localhost:3000/api
```

### Endpoints

#### Prompts

- `GET /prompts` - List all prompts
- `POST /prompts` - Create a new prompt
- `GET /prompts/:id` - Get a specific prompt with versions
- `PUT /prompts/:id` - Update a prompt
- `DELETE /prompts/:id` - Delete a prompt

#### Versions

- `GET /prompts/:id/versions` - Get all versions of a prompt
- `POST /prompts/:id/versions` - Create a new version
- `POST /versions/:versionId/publish` - Publish a version

#### Execution

- `POST /prompts/execute` - Execute a prompt with variables
- `GET /versions/:versionId/executions` - Get execution history

#### Templates

- `POST /prompts/templates/system` - Create system prompt from template
- `POST /prompts/templates/chat` - Create chat prompt from template

#### Analytics

- `GET /stats` - Get system statistics

## Usage Examples

### Creating a Prompt

```bash
curl -X POST http://localhost:3000/api/prompts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Email Writer",
    "description": "Generate professional emails",
    "category": "communication",
    "tags": ["email", "professional", "business"],
    "content": "Write a professional email about {{topic}} to {{recipient}}. The tone should be {{tone}} and include {{key_points}}.",
    "variables": ["topic", "recipient", "tone", "key_points"]
  }'
```

### Executing a Prompt

```bash
curl -X POST http://localhost:3000/api/prompts/execute \
  -H "Content-Type: application/json" \
  -d '{
    "promptId": "prompt-id-here",
    "variables": {
      "topic": "quarterly budget review",
      "recipient": "the finance team",
      "tone": "formal",
      "key_points": "budget variance analysis and next quarter projections"
    }
  }'
```

### Creating a System Prompt Template

```bash
curl -X POST http://localhost:3000/api/prompts/templates/system \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Reviewer",
    "role": "a senior software engineer",
    "instructions": "Review code for best practices and potential improvements",
    "constraints": [
      "Focus on readability and maintainability",
      "Identify potential bugs or security issues"
    ],
    "examples": [
      {
        "input": "function add(a, b) { return a + b; }",
        "output": "Consider adding type annotations and input validation"
      }
    ]
  }'
```

## Mastra Integration

### Using the Prompt Agent

The system includes a specialized Mastra agent for prompt management:

```typescript
import { mastra } from './src/mastra/index.js';

const agent = mastra.getAgent('promptAgent');

// Ask the agent to create a prompt
const result = await agent.generate('Create a system prompt for a travel planning assistant', {
  tools: ['create_system_prompt'],
});

// Ask the agent to execute a prompt
const execution = await agent.generate('Execute the "Email Writer" prompt with topic "meeting follow-up"', {
  tools: ['execute_prompt'],
});
```

### Available Tools

The prompt agent has access to these tools:

- `create_prompt` - Create new prompts
- `execute_prompt` - Execute prompts with variables
- `get_prompt` - Retrieve prompts by name or ID
- `list_prompts` - List and search prompts
- `create_version` - Create new versions
- `publish_version` - Publish versions
- `get_prompt_stats` - Get system statistics
- `get_execution_history` - View execution history
- `create_system_prompt` - Create system prompts from templates
- `create_chat_prompt` - Create chat prompts from templates

## Database Schema

The system uses SQLite with the following tables:

### prompts

- `id` - Unique identifier
- `name` - Prompt name (unique)
- `description` - Optional description
- `category` - Optional category
- `tags` - JSON array of tags
- `is_active` - Active status
- `created_at` / `updated_at` - Timestamps
- `created_by` - Creator identifier

### prompt_versions

- `id` - Unique identifier
- `prompt_id` - Foreign key to prompts
- `version` - Version string (e.g., "1.0.0")
- `content` - Prompt content with variables
- `variables` - JSON array of variable names
- `metadata` - JSON object for additional data
- `is_published` - Published status
- `created_at` - Timestamp
- `created_by` - Creator identifier

### prompt_executions

- `id` - Unique identifier
- `prompt_version_id` - Foreign key to prompt_versions
- `input` - JSON object of input variables
- `output` - Generated response
- `model` - Model used for generation
- `tokens` - Token count
- `duration` - Execution time in milliseconds
- `success` - Success status
- `error` - Error message if failed
- `executed_at` - Timestamp

## Variable System

Prompts support dynamic variables using the `{{variable_name}}` syntax:

```text
Write a {{type}} about {{subject}} in a {{tone}} tone.
The target audience is {{audience}}.

Requirements:
- Length: {{length}} words
- Include: {{requirements}}
```

Variables are automatically extracted from prompt content and can be provided during execution.

## Development

### Project Structure

```
src/
├── database/           # Database connection and schema
├── models/            # Data access layer
├── services/          # Business logic layer
├── routes/            # REST API routes
├── mastra/            # Mastra configuration
│   ├── agents/        # Mastra agents
│   └── tools/         # Mastra tools
├── types/             # TypeScript type definitions
└── index.ts           # Application entry point
```

### Adding New Features

1. **Database Changes**: Update `src/database/schema.sql`
2. **Types**: Add types to `src/types/index.ts`
3. **Repository**: Add methods to `src/models/PromptRepository.ts`
4. **Service**: Add business logic to `src/services/PromptService.ts`
5. **API**: Add routes to `src/routes/api.ts`
6. **Tools**: Add Mastra tools to `src/mastra/tools/`

### Testing

```bash
# Run tests (when implemented)
pnpm test

# Type checking
pnpm run check

# Build
pnpm run build
```

## Environment Variables

```bash
# Required: LLM Provider API Key
OPENAI_API_KEY=your_openai_key
# OR
ANTHROPIC_API_KEY=your_anthropic_key

# Optional: Server Configuration
PORT=3000
NODE_ENV=development

# Optional: Database Configuration
DATABASE_PATH=./prompt-cms.db
```

## Production Deployment

1. **Build the application:**

   ```bash
   pnpm run build
   ```

2. **Set production environment variables**

3. **Start the production server:**
   ```bash
   pnpm start
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues:

1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

## Roadmap

### Planned Features

- [ ] Web UI for prompt management
- [ ] Prompt templates marketplace
- [ ] Advanced analytics dashboard
- [ ] Multi-user support with permissions
- [ ] Prompt testing and A/B testing
- [ ] Integration with more LLM providers
- [ ] Prompt optimization suggestions
- [ ] Batch execution capabilities
- [ ] Webhook support for integrations
- [ ] Import/export functionality

### Current Limitations

- Single-user system (no authentication)
- Basic versioning (semantic versioning recommended)
- Limited to text prompts (no multimodal support yet)
- In-memory caching not implemented

---

Built with ❤️ using [Mastra](https://mastra.ai)
