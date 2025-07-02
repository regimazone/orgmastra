import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { apiRouter } from './routes/api.js';
import { mastra } from './mastra/index.js';
import { PromptService } from './services/PromptService.js';

const app = new Hono();
const promptService = new PromptService();

// Mount API routes
app.route('/api', apiRouter);

// Root route
app.get('/', c => {
  return c.json({
    message: 'Prompt CMS API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      prompts: '/api/prompts',
      execute: '/api/prompts/execute',
      templates: {
        system: '/api/prompts/templates/system',
        chat: '/api/prompts/templates/chat',
      },
    },
  });
});

// Demo function to create sample data
async function createSampleData() {
  try {
    console.log('Creating sample prompts...');

    // Create a system prompt for code review
    await promptService.createSystemPrompt(
      'Code Review Assistant',
      'a senior software engineer specializing in code reviews',
      'Review the provided code for best practices, potential bugs, security issues, and performance improvements. Provide constructive feedback with specific suggestions.',
      [
        'Focus on code quality and maintainability',
        'Identify potential security vulnerabilities',
        'Suggest performance optimizations where applicable',
        'Be constructive and educational in feedback',
      ],
      [
        {
          input: 'function add(a, b) { return a + b; }',
          output:
            'The function looks good but could benefit from type annotations and input validation. Consider: function add(a: number, b: number): number { if (typeof a !== "number" || typeof b !== "number") throw new Error("Invalid input"); return a + b; }',
        },
      ],
      'system',
    );

    // Create a chat prompt for customer support
    await promptService.createChatPrompt(
      'Customer Support Bot',
      'You are a helpful customer support representative. Be friendly, professional, and solution-oriented.',
      'Customer: {{customer_message}}\n\nPlease provide a helpful response addressing their concern.',
      'system',
    );

    // Create a creative writing prompt
    await promptService.createPrompt(
      {
        name: 'Story Generator',
        description: 'Generate creative stories based on given prompts',
        category: 'creative',
        tags: ['creative', 'writing', 'storytelling'],
        content: `Write a {{genre}} story about {{main_character}} who discovers {{plot_device}}. 

The story should:
- Be approximately {{word_count}} words
- Include vivid descriptions
- Have a clear beginning, middle, and end
- Capture the reader's attention from the first sentence

Setting: {{setting}}
Tone: {{tone}}

Story:`,
        variables: ['genre', 'main_character', 'plot_device', 'word_count', 'setting', 'tone'],
      },
      'system',
    );

    // Publish the first versions
    const prompts = await promptService.getAllPrompts();
    for (const prompt of prompts) {
      const promptWithVersions = await promptService.getPrompt(prompt.id);
      if (promptWithVersions?.versions[0]) {
        await promptService.publishVersion(promptWithVersions.versions[0].id);
      }
    }

    console.log('Sample data created successfully!');

    // Display stats
    const stats = await promptService.getPromptStats();
    console.log('Current stats:', stats);
  } catch (error) {
    console.error('Error creating sample data:', error);
  }
}

// Start server
const port = parseInt(process.env.PORT || '3000');

console.log('Starting Prompt CMS...');

// Create sample data on startup
createSampleData().then(() => {
  console.log(`Server starting on port ${port}...`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`🚀 Prompt CMS is running on http://localhost:${port}`);
  console.log(`📖 API Documentation: http://localhost:${port}/api/health`);
  console.log(`📊 Stats: http://localhost:${port}/api/stats`);
});

// Example usage with Mastra agent
async function demonstrateAgent() {
  console.log('\n--- Demonstrating Mastra Agent Integration ---');

  try {
    const agent = mastra.getAgent('promptAgent');

    // Example: Ask agent to create a prompt
    const result = await agent.generate(
      'Create a system prompt for a travel planning assistant that helps users plan trips',
      {
        tools: ['create_system_prompt'],
      },
    );

    console.log('Agent response:', result.text);

    // Example: Ask agent to list prompts
    const listResult = await agent.generate('Show me all the prompts in the system', {
      tools: ['list_prompts'],
    });

    console.log('Prompts list:', listResult.text);
  } catch (error) {
    console.error('Agent demonstration error:', error);
  }
}

// Run agent demonstration after a delay
setTimeout(demonstrateAgent, 5000);

export { app };
