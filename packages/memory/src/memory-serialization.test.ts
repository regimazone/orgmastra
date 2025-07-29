import { describe, it, expect, beforeEach } from 'vitest';
import { Memory } from './index';
import { InMemoryStore } from '@mastra/core/storage';
import { MastraMessageV1 } from '@mastra/core';

describe('Memory saveMessages content serialization bug', () => {
  let memory: Memory;
  let storage: InMemoryStore;

  beforeEach(() => {
    // Create an in-memory storage instance to test with
    storage = new InMemoryStore();

    memory = new Memory({
      storage,
    });
  });

  it('should correctly serialize and deserialize string content without converting to numbered object', async () => {
    // Create a thread first
    const thread = {
      id: 'test-thread-1',
      title: 'Test Thread',
      resourceId: 'test-resource',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await memory.saveThread({ thread });

    // Try to save a message with string content
    const testMessage = {
      id: 'test-message-1',
      threadId: 'test-thread-1',
      role: 'user',
      content: 'This is a test message',
      createdAt: new Date(),
      type: 'text',
    } as const;

    // Save the message
    await memory.saveMessages({ messages: [testMessage] });

    // Retrieve the message
    const result = await memory.query({ threadId: 'test-thread-1' });

    // Verify the fix - content should remain a string
    const retrievedContent = result.messages[0]?.content;

    // After the fix, content should be a string
    expect(typeof retrievedContent).toBe('string');
    expect(retrievedContent).toBe('This is a test message');

    // Ensure it's NOT an object (strings in JS technically have numbered properties, but typeof is 'string')
    expect(typeof retrievedContent).not.toBe('object');
  });

  it('should correctly handle v2 messages with nested content structure', async () => {
    // Create a thread
    const thread = {
      id: 'test-thread-2',
      title: 'Test Thread 2',
      resourceId: 'test-resource-2',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await memory.saveThread({ thread });

    // Save a v2 format message
    const testMessageV2 = {
      id: 'test-message-v2',
      threadId: 'test-thread-2',
      role: 'user' as const,
      content: {
        content: 'Test message 1',
        parts: [],
      },
      type: 'v2' as const,
      createdAt: new Date(),
    };

    // This should now work without errors
    await memory.saveMessages({ messages: [testMessageV2], format: 'v2' });

    // Retrieve and check the saved message
    const result = await memory.query({ threadId: 'test-thread-2' });

    // Verify the v2 message content structure is preserved
    const v2Message = result.messagesV2[0];

    // Check that we got a message back with the correct structure
    expect(v2Message).toBeDefined();
    expect(v2Message.id).toBe('test-message-v2');

    // The content should be preserved correctly
    const v2Content = v2Message.content;
    expect(typeof v2Content).toBe('object');

    // The v2 message content has been transformed to use format: 2
    expect(v2Content.format).toBe(2); // v2 format
    expect(v2Content.parts).toBeDefined();
    expect(Array.isArray(v2Content.parts)).toBe(true);

    // Most importantly, the content is NOT converted to an object with numbered keys
    // If the bug was present, v2Content would look like {"0": "T", "1": "e", ...}
    expect(v2Content).not.toHaveProperty('0');
    expect(v2Content).not.toHaveProperty('content'); // The 'content' property was transformed to format/parts
  });
});
