import { describe, it, expect } from 'vitest';
import type { MastraMessageV2 } from '../../message-list';
import { convertToV1Messages } from './convert-to-mastra-v1';

describe('convertToV1Messages', () => {
  it('should preserve toolInvocations when text follows tool invocations (reproduces issue #6087)', () => {
    // This reproduces the exact issue from GitHub issue #6087
    // When an assistant message has tool invocations followed by text,
    // the tool history should remain accessible
    //
    // NOTE: This test correctly identified the issue from #6087 - it verifies
    // that tool invocations are preserved in the conversion. However, it was
    // passing even when tool calls were mixed with text in a single message,
    // which made them inaccessible to the AI. The fix ensures proper message
    // separation so the AI can cleanly reference previous tool interactions.
    // The additional tests below verify this separation more explicitly.
    const messages: MastraMessageV2[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        createdAt: new Date('2024-01-01'),
        threadId: 'thread-1',
        resourceId: 'resource-1',
        content: {
          format: 2,
          content: "I'll use the weather tool for Paris now: The weather in Paris is partly cloudy.",
          parts: [
            {
              type: 'text',
              text: "I'll use the weather tool for Paris now:",
            },
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolCallId: 'toolu_01Y9o5yfKqKvdueRhupfT9Jf',
                toolName: 'weatherTool',
                args: { location: 'Paris' },
                result: {
                  temperature: 24.3,
                  feelsLike: 23.1,
                  humidity: 51,
                  windSpeed: 16,
                  windGust: 34.6,
                  conditions: 'Partly cloudy',
                  location: 'Paris',
                },
              },
            },
            {
              type: 'text',
              text: "Ok, I just checked the weather. Now, ask me your next question, and I'll try to access this tool call result from my history to demonstrate the issue! 🔍",
            },
          ],
          toolInvocations: [
            {
              state: 'result',
              toolCallId: 'toolu_01Y9o5yfKqKvdueRhupfT9Jf',
              toolName: 'weatherTool',
              args: { location: 'Paris' },
              result: {
                temperature: 24.3,
                feelsLike: 23.1,
                humidity: 51,
                windSpeed: 16,
                windGust: 34.6,
                conditions: 'Partly cloudy',
                location: 'Paris',
              },
            },
          ],
        },
      },
    ];

    const v1Messages = convertToV1Messages(messages);

    // The conversion should create messages that preserve the tool invocation history
    // We expect at least one message with tool-call type
    const toolCallMessages = v1Messages.filter(m => m.type === 'tool-call');
    expect(toolCallMessages.length).toBeGreaterThan(0);

    // We expect a tool result message
    const toolResultMessages = v1Messages.filter(m => m.type === 'tool-result');
    expect(toolResultMessages.length).toBeGreaterThan(0);

    // Most importantly, the tool invocation data should be accessible
    // Check that the tool call information is preserved
    const hasWeatherToolCall = v1Messages.some(msg => {
      if (Array.isArray(msg.content)) {
        return msg.content.some(part => part.type === 'tool-call' && part.toolName === 'weatherTool');
      }
      return false;
    });
    expect(hasWeatherToolCall).toBe(true);

    // Check that the tool result is preserved
    const hasWeatherToolResult = v1Messages.some(msg => {
      if (Array.isArray(msg.content)) {
        return msg.content.some(part => part.type === 'tool-result' && part.toolName === 'weatherTool');
      }
      return false;
    });
    expect(hasWeatherToolResult).toBe(true);
  });

  it('should handle toolInvocations array even when parts array exists', () => {
    // Test that toolInvocations array is processed when message has parts
    const messages: MastraMessageV2[] = [
      {
        id: 'msg-2',
        role: 'assistant',
        createdAt: new Date('2024-01-01'),
        threadId: 'thread-1',
        resourceId: 'resource-1',
        content: {
          format: 2,
          content: 'Processing your request',
          parts: [
            {
              type: 'text',
              text: 'Let me check that for you:',
            },
          ],
          // This toolInvocations array should be processed even though parts exists
          toolInvocations: [
            {
              state: 'result',
              toolCallId: 'call-1',
              toolName: 'searchTool',
              args: { query: 'test' },
              result: { found: true },
            },
          ],
        },
      },
    ];

    const v1Messages = convertToV1Messages(messages);

    // Should process the toolInvocations array
    const hasToolCall = v1Messages.some(
      msg => msg.type === 'tool-call' || (Array.isArray(msg.content) && msg.content.some(c => c.type === 'tool-call')),
    );
    expect(hasToolCall).toBe(true);
  });

  it('should handle mixed content with text, tool invocation, and more text', () => {
    const testMessage: MastraMessageV2 = {
      id: 'test-mixed-1',
      createdAt: new Date(),
      resourceId: 'resource-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: {
        content: 'Test content',
        format: 2,
        parts: [
          {
            type: 'text',
            text: 'Let me check the weather for you...',
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'call-123',
              toolName: 'weatherTool',
              args: {
                location: 'New York',
              },
              result: {
                temperature: 72,
                conditions: 'Sunny',
                humidity: 45,
              },
            },
          },
          {
            type: 'text',
            text: 'The weather in New York is currently sunny with a temperature of 72°F.',
          },
        ],
      },
    };

    const result = convertToV1Messages([testMessage]);

    // Should have 4 messages: text before, tool call, tool result, text after
    expect(result.length).toBe(4);

    // First message should be assistant text
    expect(result[0].role).toBe('assistant');
    expect(result[0].type).toBe('text');

    // Second message should be assistant tool-call
    expect(result[1].role).toBe('assistant');
    expect(result[1].type).toBe('tool-call');

    // Third message should be tool result
    expect(result[2].role).toBe('tool');
    expect(result[2].type).toBe('tool-result');

    // Fourth message should be assistant text
    expect(result[3].role).toBe('assistant');
    expect(result[3].type).toBe('text');

    // Verify tool result is preserved
    const toolResultMessage = result.find(msg => msg.role === 'tool' && msg.type === 'tool-result');
    expect(toolResultMessage).toBeDefined();

    if (toolResultMessage && Array.isArray(toolResultMessage.content)) {
      const toolResult = toolResultMessage.content[0];
      if (toolResult.type === 'tool-result') {
        expect(toolResult.result).toBeDefined();
        expect((toolResult.result as any).temperature).toBe(72);
      }
    }
  });

  it('should handle the exact message structure from issue #6087', () => {
    const testMessage: MastraMessageV2 = {
      id: 'test-issue-6087',
      createdAt: new Date(),
      resourceId: 'resource-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: {
        content: undefined,
        format: 2,
        parts: [
          {
            type: 'text',
            text: "I'll first search for the information and then create a summary for you.\n\nSearching now...",
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'call-456',
              toolName: 'searchTool',
              args: {
                query: 'latest AI developments',
              },
              result: {
                found: true,
                results: ['GPT-4 improvements', 'New computer vision models', 'Open source AI progress'],
                count: 3,
              },
            },
          },
          {
            type: 'text',
            text: 'Great! I found 3 relevant results about the latest AI developments. Would you like me to elaborate on any of these?',
          },
        ],
        toolInvocations: [
          {
            state: 'result',
            toolCallId: 'call-456',
            toolName: 'searchTool',
            args: {
              query: 'latest AI developments',
            },
            result: {
              found: true,
              results: ['GPT-4 improvements', 'New computer vision models', 'Open source AI progress'],
              count: 3,
            },
          },
        ],
      },
    };

    const result = convertToV1Messages([testMessage]);

    // Should have 4 messages: text before, tool call, tool result, text after
    expect(result.length).toBe(4);

    // First message should be assistant text
    expect(result[0].role).toBe('assistant');
    expect(result[0].type).toBe('text');

    // Second message should be assistant tool-call
    expect(result[1].role).toBe('assistant');
    expect(result[1].type).toBe('tool-call');

    // Third message should be tool result
    expect(result[2].role).toBe('tool');
    expect(result[2].type).toBe('tool-result');

    // Fourth message should be assistant text
    expect(result[3].role).toBe('assistant');
    expect(result[3].type).toBe('text');

    // Verify tool result is preserved with all data
    const toolResultMessage = result.find(msg => msg.role === 'tool' && msg.type === 'tool-result');
    expect(toolResultMessage).toBeDefined();

    if (toolResultMessage && Array.isArray(toolResultMessage.content)) {
      const toolResult = toolResultMessage.content[0];
      if (toolResult.type === 'tool-result' && toolResult.result) {
        expect(toolResult.result).toBeDefined();
        expect((toolResult.result as any).count).toBe(3);
      }
    }
  });
});
