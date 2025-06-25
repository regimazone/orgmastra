import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { LibsqlMemory } from '@mastra/memory/libsql';

// Mock LLM that implements the AI SDK v5 interface for testing
const mockModel = {
  modelId: 'mock-model',
  provider: 'mock',

  doStream: async function* (options) {
    // Simple mock stream implementation
    yield { type: 'text-delta', textDelta: 'Hello' };
    yield { type: 'text-delta', textDelta: ' world' };
    yield { type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 2 } };
  },

  doGenerate: async function (options) {
    return {
      text: 'Hello world',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 2 },
    };
  },
};

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
  model: mockModel,
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
