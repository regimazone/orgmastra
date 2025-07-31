import { describe, it, expect } from 'vitest';
import type { MastraMessageV2 } from '../../message-list';
import { convertToV1Messages } from './convert-to-mastra-v1';

describe('convertToV1Messages', () => {
  it('should preserve toolInvocations when text follows tool invocations (reproduces issue #6087)', () => {
    // This reproduces the exact issue from GitHub issue #6087
    // When an assistant message has tool invocations followed by text,
    // the tool history should remain accessible
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
            text: "Je vais d'abord chercher la météo à Istanbul...",
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'toolu_016FQRkafLDLcMekRNXjWNC4',
              toolName: 'generateAudioMessageTool',
              args: {
                text: 'Salut ! Je viens de regarder la météo à Istanbul...',
                message: "Je crée un message vocal avec les infos météo d'Istanbul 🎤",
                seed: 'istanbul_weather_vocal',
              },
              result: {
                id: 'placeholder-audio-id',
                type: 'audio',
                seed: 'istanbul_weather_vocal',
                status: 'Audio Message has been generated and sent to the user.',
                text: 'Salut ! Je viens de regarder la météo à Istanbul...',
                mediaId: '1094206962073368',
              },
            },
          },
          {
            type: 'text',
            text: 'Voilà ! Tu as reçu les infos en texte et en audio 😊',
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
        expect(toolResult.result.mediaId).toBe('1094206962073368');
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
            text: "Je vais d'abord chercher la météo à Istanbul, puis je te ferai un message vocal avec l'info ! \n\nÀ Istanbul actuellement :\n🌡️ 14°C (ressenti 13°C)\n🌧️ Pluie légère\n💨 Vent à 14 km/h\n💧 Humidité : 82%\n\nMaintenant, je te fais un petit message vocal avec ces infos !",
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'toolu_016FQRkafLDLcMekRNXjWNC4',
              toolName: 'generateAudioMessageTool',
              args: {
                text: "Salut ! Je viens de regarder la météo à Istanbul. Il fait actuellement 14 degrés, avec une température ressentie de 13 degrés. Il y a un peu de pluie légère, et le vent souffle à 14 kilomètres par heure. L'humidité est assez élevée, à 82%. C'est une journée plutôt fraîche et humide à Istanbul aujourd'hui !",
                message: "Je crée un message vocal avec les infos météo d'Istanbul 🎤",
                seed: 'istanbul_weather_vocal',
              },
              result: {
                id: 'placeholder-audio-id',
                type: 'audio',
                seed: 'istanbul_weather_vocal',
                status: 'Audio Message has been generated and sent to the user.',
                text: "Salut ! Je viens de regarder la météo à Istanbul. Il fait actuellement 14 degrés, avec une température ressentie de 13 degrés. Il y a un peu de pluie légère, et le vent souffle à 14 kilomètres par heure. L'humidité est assez élevée, à 82%. C'est une journée plutôt fraîche et humide à Istanbul aujourd'hui !",
                mediaId: '1094206962073368',
              },
            },
          },
          {
            type: 'text',
            text: 'Voilà ! Tu as reçu les infos en texte et en audio 😊 Tu prévois un voyage à Istanbul ?',
          },
        ],
        toolInvocations: [
          {
            state: 'result',
            toolCallId: 'toolu_016FQRkafLDLcMekRNXjWNC4',
            toolName: 'generateAudioMessageTool',
            args: {
              text: "Salut ! Je viens de regarder la météo à Istanbul. Il fait actuellement 14 degrés, avec une température ressentie de 13 degrés. Il y a un peu de pluie légère, et le vent souffle à 14 kilomètres par heure. L'humidité est assez élevée, à 82%. C'est une journée plutôt fraîche et humide à Istanbul aujourd'hui !",
              message: "Je crée un message vocal avec les infos météo d'Istanbul 🎤",
              seed: 'istanbul_weather_vocal',
            },
            result: {
              id: 'placeholder-audio-id',
              type: 'audio',
              seed: 'istanbul_weather_vocal',
              status: 'Audio Message has been generated and sent to the user.',
              text: "Salut ! Je viens de regarder la météo à Istanbul. Il fait actuellement 14 degrés, avec une température ressentie de 13 degrés. Il y a un peu de pluie légère, et le vent souffle à 14 kilomètres par heure. L'humidité est assez élevée, à 82%. C'est une journée plutôt fraîche et humide à Istanbul aujourd'hui !",
              mediaId: '1094206962073368',
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
      if (toolResult.type === 'tool-result') {
        expect(toolResult.result).toBeDefined();
        expect(toolResult.result.mediaId).toBe('1094206962073368');
      }
    }
  });

  it('should handle multiple tool calls in a single message', () => {
    const testMessage: MastraMessageV2 = {
      id: 'test-multiple-tools',
      createdAt: new Date(),
      resourceId: 'resource-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: {
        content: 'Test content with multiple tools',
        format: 2,
        parts: [
          {
            type: 'text',
            text: "I'll check the weather in multiple cities for you.",
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tool-call-1',
              toolName: 'weatherTool',
              args: { location: 'Paris' },
              result: {
                temperature: 24.3,
                conditions: 'Partly cloudy',
                location: 'Paris',
              },
            },
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tool-call-2',
              toolName: 'weatherTool',
              args: { location: 'London' },
              result: {
                temperature: 18.5,
                conditions: 'Rainy',
                location: 'London',
              },
            },
          },
          {
            type: 'text',
            text: 'Now let me search for flights between these cities.',
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tool-call-3',
              toolName: 'flightSearchTool',
              args: { from: 'Paris', to: 'London' },
              result: {
                flights: [
                  { airline: 'Air France', price: 120, duration: '1h 15m' },
                  { airline: 'British Airways', price: 135, duration: '1h 20m' },
                ],
              },
            },
          },
          {
            type: 'text',
            text: 'Based on the weather and flight information, Paris has better weather (24.3°C and partly cloudy) compared to London (18.5°C and rainy). There are affordable flights available starting at €120.',
          },
        ],
      },
    };

    const result = convertToV1Messages([testMessage]);

    // Should have 9 messages:
    // 1. text ("I'll check the weather...")
    // 2. tool-call (weather Paris)
    // 3. tool-result (weather Paris result)
    // 4. tool-call (weather London)
    // 5. tool-result (weather London result)
    // 6. text ("Now let me search for flights...")
    // 7. tool-call (flight search)
    // 8. tool-result (flight search result)
    // 9. text ("Based on the weather and flight information...")
    expect(result.length).toBe(9);

    // Verify the sequence of messages
    expect(result[0].role).toBe('assistant');
    expect(result[0].type).toBe('text');

    expect(result[1].role).toBe('assistant');
    expect(result[1].type).toBe('tool-call');

    expect(result[2].role).toBe('tool');
    expect(result[2].type).toBe('tool-result');

    expect(result[3].role).toBe('assistant');
    expect(result[3].type).toBe('tool-call');

    expect(result[4].role).toBe('tool');
    expect(result[4].type).toBe('tool-result');

    expect(result[5].role).toBe('assistant');
    expect(result[5].type).toBe('text');

    expect(result[6].role).toBe('assistant');
    expect(result[6].type).toBe('tool-call');

    expect(result[7].role).toBe('tool');
    expect(result[7].type).toBe('tool-result');

    expect(result[8].role).toBe('assistant');
    expect(result[8].type).toBe('text');

    // Verify all tool calls are preserved
    const toolCallMessages = result.filter(msg => msg.type === 'tool-call');
    expect(toolCallMessages.length).toBe(3);

    const toolResultMessages = result.filter(msg => msg.type === 'tool-result');
    expect(toolResultMessages.length).toBe(3);

    // Verify specific tool results
    const weatherResults = toolResultMessages.filter(msg => {
      if (Array.isArray(msg.content)) {
        return msg.content.some(part => part.type === 'tool-result' && part.toolName === 'weatherTool');
      }
      return false;
    });
    expect(weatherResults.length).toBe(2);

    const flightResults = toolResultMessages.filter(msg => {
      if (Array.isArray(msg.content)) {
        return msg.content.some(part => part.type === 'tool-result' && part.toolName === 'flightSearchTool');
      }
      return false;
    });
    expect(flightResults.length).toBe(1);
  });

  it('should handle multiple tool calls with mixed toolInvocations array and parts', () => {
    const testMessage: MastraMessageV2 = {
      id: 'test-mixed-multiple',
      createdAt: new Date(),
      resourceId: 'resource-1',
      threadId: 'thread-1',
      role: 'assistant',
      content: {
        content: 'Multiple tools test',
        format: 2,
        parts: [
          {
            type: 'text',
            text: 'Let me gather some information for you.',
          },
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'tool-in-parts-1',
              toolName: 'searchTool',
              args: { query: 'best restaurants' },
              result: { results: ['Restaurant A', 'Restaurant B'] },
            },
          },
        ],
        // Additional tool invocations in the toolInvocations array
        toolInvocations: [
          {
            state: 'result',
            toolCallId: 'tool-in-parts-1', // This is a duplicate, should be ignored
            toolName: 'searchTool',
            args: { query: 'best restaurants' },
            result: { results: ['Restaurant A', 'Restaurant B'] },
          },
          {
            state: 'result',
            toolCallId: 'tool-in-array-1',
            toolName: 'reservationTool',
            args: { restaurant: 'Restaurant A', time: '19:00' },
            result: { confirmed: true, reservationId: 'RES123' },
          },
          {
            state: 'result',
            toolCallId: 'tool-in-array-2',
            toolName: 'mapsTool',
            args: { destination: 'Restaurant A' },
            result: { distance: '2.5km', duration: '10 minutes' },
          },
        ],
      },
    };

    const result = convertToV1Messages([testMessage]);

    // The actual behavior:
    // 1. text
    // 2. tool-call (from parts)
    // 3. tool-result (from parts)
    // 4. tool-call (both array invocations grouped together since same step)
    // 5. tool-result (both array results grouped together)
    // Total: 5 messages
    expect(result.length).toBe(5);

    // Verify no duplicate tool calls
    const toolCallContents: string[] = [];
    result.forEach(msg => {
      if (msg.type === 'tool-call' && Array.isArray(msg.content)) {
        msg.content.forEach(part => {
          if (part.type === 'tool-call') {
            toolCallContents.push(part.toolCallId);
          }
        });
      }
    });

    // Should have 3 unique tool calls
    expect(toolCallContents.length).toBe(3);
    expect(new Set(toolCallContents).size).toBe(3);
    expect(toolCallContents).toContain('tool-in-parts-1');
    expect(toolCallContents).toContain('tool-in-array-1');
    expect(toolCallContents).toContain('tool-in-array-2');
  });
});
