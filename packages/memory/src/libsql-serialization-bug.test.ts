import fs from 'fs';
import { LibSQLStore } from '@mastra/libsql';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Memory } from './index';

describe('LibSQL Memory saveMessages content serialization bug', () => {
  let memory: Memory;
  let storage: LibSQLStore;
  const dbPath = './test-memory-bug.db';

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    // Create LibSQL storage instance using file URL
    storage = new LibSQLStore({
      url: `file:${dbPath}`,
    });
    await storage.init();

    memory = new Memory({
      storage,
    });
  });

  afterEach(async () => {
    // Clean up test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('should reproduce the content serialization bug with LibSQL - string content becomes object with numbered keys', async () => {
    // Create a thread first
    const thread = {
      id: 'test-thread-1',
      title: 'Test Thread',
      resourceId: 'test-resource',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await memory.saveThread({ thread });

    // Save a v1 message with string content (like in the bug report)
    const testMessage = {
      id: 'test-message-1',
      threadId: 'test-thread-1',
      role: 'user' as const,
      content: 'Test message 1',
      createdAt: new Date(),
    };

    // Save the message
    await memory.saveMessages({ messages: [testMessage] });

    // Retrieve the message
    const result = await memory.query({ threadId: 'test-thread-1' });

    console.log('Retrieved message:', JSON.stringify(result.messages[0], null, 2));

    // Check if the bug is present
    const retrievedContent = result.messages[0]?.content;

    // The bug should manifest as content being an object with numbered keys
    if (typeof retrievedContent === 'object' && !Array.isArray(retrievedContent)) {
      console.log('BUG REPRODUCED: String content was serialized as object with numbered keys');

      // Verify it has the numbered keys like {"0":"T","1":"e","2":"s","3":"t",...}
      expect(retrievedContent).toHaveProperty('0', 'T');
      expect(retrievedContent).toHaveProperty('1', 'e');
      expect(retrievedContent).toHaveProperty('2', 's');
      expect(retrievedContent).toHaveProperty('3', 't');
      expect(retrievedContent).toHaveProperty('4', ' ');
      expect(retrievedContent).toHaveProperty('5', 'm');
      expect(retrievedContent).toHaveProperty('6', 'e');
      expect(retrievedContent).toHaveProperty('7', 's');
      expect(retrievedContent).toHaveProperty('8', 's');
      expect(retrievedContent).toHaveProperty('9', 'a');
      expect(retrievedContent).toHaveProperty('10', 'g');
      expect(retrievedContent).toHaveProperty('11', 'e');
      expect(retrievedContent).toHaveProperty('12', ' ');
      expect(retrievedContent).toHaveProperty('13', '1');

      // This should be true when the bug is present
      expect(typeof retrievedContent).toBe('object');
    } else {
      // If this is reached, the bug is not reproduced
      throw new Error(
        'Bug not reproduced - content is not an object with numbered keys. Content type: ' + typeof retrievedContent,
      );
    }
  });

  it('should trigger the exact error from the bug report', async () => {
    // Create a thread
    const thread = {
      id: 'test-thread-2',
      title: 'Test Thread 2',
      resourceId: 'test-resource-2',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await memory.saveThread({ thread });

    // Save a message that will trigger the serialization bug
    const testMessage = {
      id: 'test-message-2',
      threadId: 'test-thread-2',
      role: 'user' as const,
      content: 'This is a test message',
      createdAt: new Date(),
    };

    await memory.saveMessages({ messages: [testMessage] });

    // When retrieved, if the bug is present, the content will be an object with numbered keys
    // This might cause issues in other parts of the system that expect string content
    const result = await memory.query({ threadId: 'test-thread-2' });

    // Log the problematic structure
    console.log(
      'Message that would cause "Found unhandled message" error:',
      JSON.stringify(
        {
          role: result.messages[0]?.role,
          content: result.messages[0]?.content,
          type: 'v2',
        },
        null,
        2,
      ),
    );
  });
});
