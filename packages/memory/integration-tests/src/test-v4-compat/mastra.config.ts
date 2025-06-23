
import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { LibsqlMemory } from '@mastra/memory/libsql';

const mockTool = {
  description: 'A mock tool for testing',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
    required: ['message'],
  },
  execute: async ({ message }) => {
    return { result: `Tool executed with: ${message}` };
  },
};

const testAgent = new Agent({
  name: 'test-agent',
  instructions: 'You are a helpful test agent. When asked to use a tool, use the mock_tool with the user message.',
  model: openai('gpt-4o'),
  tools: { mock_tool: mockTool },
});

const memory = new LibsqlMemory({
  url: ':memory:',
});

export const mastra = new Mastra({
  agents: { 'test-agent': testAgent },
  memory,
  aiSdkCompat: 'v4', // Force v4 compatibility
});
