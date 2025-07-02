import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { PromptService } from '../services/PromptService.js';
import { CreatePromptSchema, UpdatePromptSchema, CreateVersionSchema, ExecutePromptSchema } from '../types/index.js';

const app = new Hono();
const promptService = new PromptService();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/health', c => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get stats
app.get('/stats', async c => {
  try {
    const stats = await promptService.getPromptStats();
    const categories = await promptService.getCategories();
    const tags = await promptService.getAllTags();

    return c.json({
      success: true,
      data: { stats, categories, tags },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

// Prompts routes
app.get('/prompts', async c => {
  try {
    const activeOnly = c.req.query('activeOnly') !== 'false';
    const category = c.req.query('category');
    const tags = c.req.query('tags')?.split(',').filter(Boolean);
    const search = c.req.query('search');

    let prompts;
    if (search || category || tags) {
      prompts = await promptService.searchPrompts(search || '', category, tags);
    } else {
      prompts = await promptService.getAllPrompts(activeOnly);
    }

    return c.json({
      success: true,
      data: prompts,
      count: prompts.length,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

app.post('/prompts', async c => {
  try {
    const body = await c.req.json();
    const data = CreatePromptSchema.parse(body);
    const createdBy = c.req.header('x-user-id');

    const prompt = await promptService.createPrompt(data, createdBy);

    return c.json(
      {
        success: true,
        data: prompt,
        message: `Prompt "${prompt.name}" created successfully`,
      },
      201,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

app.get('/prompts/:id', async c => {
  try {
    const id = c.req.param('id');
    const prompt = await promptService.getPrompt(id);

    if (!prompt) {
      return c.json(
        {
          success: false,
          error: 'Prompt not found',
        },
        404,
      );
    }

    return c.json({
      success: true,
      data: prompt,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

app.put('/prompts/:id', async c => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = UpdatePromptSchema.parse(body);

    const prompt = await promptService.updatePrompt(id, data);

    if (!prompt) {
      return c.json(
        {
          success: false,
          error: 'Prompt not found',
        },
        404,
      );
    }

    return c.json({
      success: true,
      data: prompt,
      message: 'Prompt updated successfully',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

app.delete('/prompts/:id', async c => {
  try {
    const id = c.req.param('id');
    const success = await promptService.deletePrompt(id);

    if (!success) {
      return c.json(
        {
          success: false,
          error: 'Prompt not found',
        },
        404,
      );
    }

    return c.json({
      success: true,
      message: 'Prompt deleted successfully',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

// Version routes
app.get('/prompts/:id/versions', async c => {
  try {
    const promptId = c.req.param('id');
    const versions = await promptService.getVersions(promptId);

    return c.json({
      success: true,
      data: versions,
      count: versions.length,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

app.post('/prompts/:id/versions', async c => {
  try {
    const promptId = c.req.param('id');
    const body = await c.req.json();
    const data = CreateVersionSchema.parse(body);
    const createdBy = c.req.header('x-user-id');

    const version = await promptService.createVersion(promptId, data, createdBy);

    return c.json(
      {
        success: true,
        data: version,
        message: `Version ${version.version} created successfully`,
      },
      201,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

app.post('/versions/:versionId/publish', async c => {
  try {
    const versionId = c.req.param('versionId');
    const success = await promptService.publishVersion(versionId);

    if (!success) {
      return c.json(
        {
          success: false,
          error: 'Version not found',
        },
        404,
      );
    }

    return c.json({
      success: true,
      message: 'Version published successfully',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

app.get('/versions/:versionId/executions', async c => {
  try {
    const versionId = c.req.param('versionId');
    const limit = parseInt(c.req.query('limit') || '50');

    const executions = await promptService.getExecutionHistory(versionId, limit);

    return c.json({
      success: true,
      data: executions,
      count: executions.length,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    );
  }
});

// Execute prompt
app.post('/prompts/execute', async c => {
  try {
    const body = await c.req.json();
    const data = ExecutePromptSchema.parse(body);

    // Simple LLM function for demo (in real app, this would use the actual LLM)
    const llmGenerate = async (prompt: string): Promise<string> => {
      // This is a placeholder - in real implementation, you'd use the Mastra agent
      return `[DEMO] Generated response for prompt: ${prompt.substring(0, 100)}...`;
    };

    const result = await promptService.executePrompt(data, llmGenerate, data.model);

    return c.json({
      success: true,
      data: {
        result: result.result,
        execution: result.execution,
      },
      message: 'Prompt executed successfully',
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

// Template routes
app.post('/prompts/templates/system', async c => {
  try {
    const body = await c.req.json();
    const { name, role, instructions, constraints, examples } = body;
    const createdBy = c.req.header('x-user-id');

    const prompt = await promptService.createSystemPrompt(name, role, instructions, constraints, examples, createdBy);

    return c.json(
      {
        success: true,
        data: prompt,
        message: `System prompt "${prompt.name}" created successfully`,
      },
      201,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

app.post('/prompts/templates/chat', async c => {
  try {
    const body = await c.req.json();
    const { name, systemMessage, userMessageTemplate } = body;
    const createdBy = c.req.header('x-user-id');

    const prompt = await promptService.createChatPrompt(name, systemMessage, userMessageTemplate, createdBy);

    return c.json(
      {
        success: true,
        data: prompt,
        message: `Chat prompt "${prompt.name}" created successfully`,
      },
      201,
    );
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      400,
    );
  }
});

export { app as apiRouter };
