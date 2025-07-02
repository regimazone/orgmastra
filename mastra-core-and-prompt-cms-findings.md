# Mastra Core & Prompt CMS Research Findings

## Overview

**Mastra** is an opinionated TypeScript framework for building AI applications and features quickly. It provides a comprehensive set of primitives including workflows, agents, RAG, integrations, and evals. The framework can run locally or be deployed to serverless cloud environments.

## Mastra Core Features

### 🎯 Core Components

| Feature          | Description                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| **LLM Models**   | Uses Vercel AI SDK for unified interface to any LLM provider (OpenAI, Anthropic, Google Gemini)  |
| **Agents**       | Systems where LLMs choose sequences of actions, with access to tools, workflows, and synced data |
| **Tools**        | Typed functions with built-in integration access and parameter validation                        |
| **Workflows**    | Durable graph-based state machines with loops, branching, human input, error handling            |
| **RAG**          | ETL pipeline for knowledge bases with chunking, embedding, and vector search                     |
| **Integrations** | Auto-generated, type-safe API clients for third-party services                                   |
| **Evals**        | Automated tests for LLM outputs using model-graded, rule-based, and statistical methods          |

### 🏗️ Architecture

- **Language**: TypeScript with full type safety
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm (recommended)
- **Framework**: Modular architecture with separate packages for each component
- **Telemetry**: Built-in OpenTelemetry tracing for workflows
- **Logging**: Pino logger integration

## Prompt CMS Implementation

### 📋 System Overview

The Prompt CMS is a **complete, production-ready Content Management System** for AI prompts built as a Mastra application. It provides systematic prompt management with versioning, execution tracking, and analytics.

### ✨ Key Features

#### Core Functionality

- **Prompt Management**: Create, update, delete prompts with rich metadata (name, description, category, tags)
- **Version Control**: Full semantic versioning system with publish/unpublish capabilities
- **Variable System**: Dynamic variables using `{{variable_name}}` syntax with automatic extraction
- **Template System**: Pre-built templates for system prompts and chat prompts
- **Execution Tracking**: Record all executions with input/output, performance metrics, success/failure

#### Advanced Features

- **Search & Discovery**: Search by name, category, tags, content with filtering
- **Analytics**: System statistics, execution history, performance metrics
- **REST API**: Complete HTTP interface using Hono framework
- **Mastra Integration**: Native tools and specialized agent for AI-powered prompt management

### 🏛️ Technical Architecture

#### Database Layer (SQLite)

```sql
-- Core tables with proper indexing and foreign keys
prompts              -- Main prompt metadata
prompt_versions      -- Version control with semantic versioning
prompt_executions    -- Execution tracking with performance metrics
```

#### Data Access Layer

- **PromptRepository**: Complete CRUD operations with advanced querying
- **Version Management**: Publish/unpublish functionality
- **Execution Tracking**: Performance metrics and success/failure logging

#### Business Logic Layer

- **PromptService**: High-level prompt management operations
- **Variable Processing**: Automatic extraction and replacement
- **Template Methods**: System and chat prompt generation
- **LLM Integration**: Execution with multiple providers

#### API Layer

- **REST Endpoints**: Complete HTTP API with proper validation
- **Error Handling**: Comprehensive error responses
- **Request/Response Schemas**: Zod-based validation

#### Mastra Integration

- **10 Specialized Tools**: Complete prompt operations (create, execute, list, version, etc.)
- **Dedicated Agent**: AI-powered prompt management with detailed instructions
- **Context Integration**: LLM execution context for prompt testing

### 🛠️ Available Mastra Tools

1. **create_prompt** - Create new prompts with metadata
2. **execute_prompt** - Execute prompts with variables and LLM integration
3. **get_prompt** - Retrieve prompts by name or ID
4. **list_prompts** - List and search prompts with filtering
5. **create_version** - Create new versions with semantic versioning
6. **publish_version** - Publish versions for production use
7. **get_prompt_stats** - System analytics and statistics
8. **get_execution_history** - View execution logs and performance
9. **create_system_prompt** - Generate system prompts from templates
10. **create_chat_prompt** - Generate chat prompts from templates

### 📊 Data Models

#### Core Schemas (Zod-based)

```typescript
// Main entities with full type safety
Prompt; // Core prompt metadata
PromptVersion; // Version control with content and variables
PromptExecution; // Execution tracking with performance metrics

// Request/Response schemas
CreatePrompt; // Prompt creation with validation
ExecutePrompt; // Execution with variable substitution
CreateVersion; // Version creation with auto-versioning
```

### 🚀 Usage Examples

#### Creating a Prompt

```bash
curl -X POST http://localhost:3000/api/prompts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Email Writer",
    "content": "Write a {{tone}} email about {{topic}} to {{recipient}}",
    "variables": ["tone", "topic", "recipient"]
  }'
```

#### Executing with Variables

```bash
curl -X POST http://localhost:3000/api/prompts/execute \
  -d '{
    "promptId": "prompt-id",
    "variables": {
      "tone": "professional",
      "topic": "budget review",
      "recipient": "finance team"
    }
  }'
```

#### Using Mastra Agent

```typescript
const agent = mastra.getAgent('promptAgent');
const result = await agent.generate('Create a system prompt for a travel planning assistant', {
  tools: ['create_system_prompt'],
});
```

### 📁 Project Structure

```
examples/prompt-cms/
├── src/
│   ├── database/           # SQLite schema and connection
│   ├── models/            # Data access layer (PromptRepository)
│   ├── services/          # Business logic (PromptService)
│   ├── routes/            # REST API endpoints (Hono)
│   ├── mastra/            # Mastra integration
│   │   ├── agents/        # Specialized prompt agent
│   │   ├── tools/         # 10 prompt management tools
│   │   └── workflows/     # Future workflow integration
│   ├── types/             # TypeScript/Zod schemas
│   └── index.ts           # Application entry point
├── demo.ts                # Comprehensive demo script
├── README.md              # Detailed documentation
└── package.json           # Dependencies and scripts
```

### 🔧 Technical Stack

- **Framework**: Mastra core with TypeScript
- **Database**: SQLite with better-sqlite3
- **API**: Hono web framework
- **Validation**: Zod schemas
- **LLM Integration**: AI SDK with OpenAI/Anthropic support
- **Logging**: Pino logger with Mastra integration

### 🎯 Production Readiness

#### Implemented Features

- ✅ Complete CRUD operations
- ✅ Version control system
- ✅ Execution tracking and analytics
- ✅ REST API with validation
- ✅ Mastra agent and tools integration
- ✅ Variable system with auto-extraction
- ✅ Template system for common patterns
- ✅ Error handling and logging
- ✅ Performance metrics tracking
- ✅ Search and filtering capabilities

#### Future Enhancements (Roadmap)

- 🔄 Web UI for prompt management
- 🔄 Multi-user support with authentication
- 🔄 Advanced analytics dashboard
- 🔄 A/B testing capabilities
- 🔄 Webhook integrations
- 🔄 Import/export functionality
- 🔄 Prompt optimization suggestions

## Getting Started

### Quick Setup

```bash
# Navigate to prompt CMS
cd examples/prompt-cms

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Add your OpenAI or Anthropic API key

# Start the application
pnpm dev
```

### Key API Endpoints

- `GET /api/prompts` - List all prompts
- `POST /api/prompts` - Create new prompt
- `POST /api/prompts/execute` - Execute prompt with variables
- `GET /api/stats` - System analytics

## Conclusion

The Mastra framework provides a **robust foundation for AI applications** with its comprehensive toolkit of agents, tools, workflows, RAG, and integrations. The **prompt CMS example demonstrates production-ready implementation** of a sophisticated content management system specifically designed for AI prompts.

Key strengths:

- **Complete TypeScript integration** with full type safety
- **Modular architecture** allowing selective use of components
- **Production-ready patterns** with proper error handling and logging
- **Extensive tooling** for AI application development
- **Active development** with regular updates and community support

The prompt CMS serves as an excellent **reference implementation** showing how to build complex AI applications using Mastra's primitives, complete with database integration, API development, and AI agent capabilities.
