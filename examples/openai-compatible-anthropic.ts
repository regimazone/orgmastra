/**
 * Example: Using Anthropic with OpenAI-compatible interface
 *
 * This example demonstrates how to use Anthropic's Claude models
 * through the OpenAI-compatible interface in Mastra.
 *
 * Note: Anthropic provides an OpenAI-compatible endpoint at /v1/chat/completions
 * which allows using Claude models with the same API format as OpenAI.
 */

import { Agent } from '@mastra/core/agent';
import { OpenAICompatibleModelId } from '@mastra/core/llm/model';

// Example 1: Using Anthropic Claude with type-safe model selection
const claudeAgent = new Agent({
  name: 'claude-assistant',
  model: 'anthropic/claude-3-5-sonnet-20241022' as OpenAICompatibleModelId,
  instructions: 'You are a helpful assistant powered by Claude.',
});

// Example 2: Using different Claude models
const haikuAgent = new Agent({
  name: 'haiku-assistant',
  model: 'anthropic/claude-3-haiku-20240307', // Fast and cost-effective
  instructions: 'You are a concise assistant using Claude Haiku.',
});

const opusAgent = new Agent({
  name: 'opus-assistant',
  model: 'anthropic/claude-3-opus-20240229', // Most capable
  instructions: 'You are a sophisticated assistant using Claude Opus.',
});

// Example 3: Custom configuration with Anthropic
import { OpenAICompatibleModel } from '@mastra/core';

const customAnthropicModel = new OpenAICompatibleModel({
  id: 'anthropic/claude-3-5-sonnet-20241022',
  // API key will be read from ANTHROPIC_API_KEY env var
  // Or you can provide it explicitly:
  // apiKey: process.env.MY_ANTHROPIC_KEY,
});

const customAgent = new Agent({
  name: 'custom-claude',
  model: customAnthropicModel,
  instructions: 'You are a custom configured Claude assistant.',
});

// Example usage
async function main() {
  try {
    // Make sure ANTHROPIC_API_KEY is set in your environment
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Please set ANTHROPIC_API_KEY environment variable');
      process.exit(1);
    }

    const response = await claudeAgent.text({
      messages: ['Tell me a short joke about programming'],
    });

    console.log('Claude says:', response.text);
  } catch (error) {
    if (error.message.includes('ANTHROPIC_API_KEY')) {
      console.error('API key error:', error.message);
    } else {
      console.error('Error:', error);
    }
  }
}

// Available Anthropic models through OpenAI-compatible interface:
const availableModels = [
  'anthropic/claude-3-7-sonnet-20250219', // Latest Sonnet
  'anthropic/claude-opus-4-1-20250805', // Latest Opus
  'anthropic/claude-3-5-sonnet-20241022', // Claude 3.5 Sonnet
  'anthropic/claude-3-5-haiku-20241022', // Claude 3.5 Haiku
  'anthropic/claude-3-opus-20240229', // Claude 3 Opus
  'anthropic/claude-3-sonnet-20240229', // Claude 3 Sonnet
  'anthropic/claude-3-haiku-20240307', // Claude 3 Haiku
];

console.log('Available Anthropic models:', availableModels);

// The models will work with the same streaming, tool calling, and other
// features as any other OpenAI-compatible provider!
