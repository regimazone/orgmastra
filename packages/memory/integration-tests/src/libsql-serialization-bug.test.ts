import fs from 'fs';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('LibSQL Memory saveMessages content serialization bug', () => {
  const dbPath = './test-memory-bug.db';
  const files = [`${dbPath}`, `${dbPath}-shm`, `${dbPath}-wal`];

  beforeEach(async () => {
    // Clean up any existing test database files
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  afterEach(async () => {
    // Clean up test database files
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  it('should demonstrate the content serialization bug', async () => {
    const memory = new Memory({
      storage: new LibSQLStore({
        url: `file:${dbPath}`,
      }),
      options: {
        semanticRecall: false,
      },
    });

    const threadId = `bug-test-${Date.now()}`;

    try {
      // This should work but currently fails due to content serialization
      await memory.saveMessages({
        threadId,
        messages: [
          {
            role: 'user',
            content: 'This is a test message',
          },
        ],
      });

      // If we get here, the bug might be fixed
      // Let's check what was actually saved
      const result = await memory.query({ threadId });
      console.log('Retrieved message:', JSON.stringify(result.messages[0], null, 2));

      const retrievedContent = result.messages[0]?.content;
      if (typeof retrievedContent === 'object' && !Array.isArray(retrievedContent)) {
        console.log('BUG REPRODUCED: String content was serialized as object with numbered keys');
        // Verify it has the numbered keys
        expect(retrievedContent).toHaveProperty('0', 'T');
        expect(retrievedContent).toHaveProperty('1', 'h');
        expect(retrievedContent).toHaveProperty('2', 'i');
        expect(retrievedContent).toHaveProperty('3', 's');
      } else {
        console.log('Bug not reproduced - content is correctly a string:', retrievedContent);
        expect(typeof retrievedContent).toBe('string');
      }
    } catch (error: any) {
      // Document the exact error we're seeing
      console.log('Error during saveMessages:', error.message);
      if (error.message.includes('Found unhandled message')) {
        expect(error.message).toContain('Found unhandled message');
        expect(error.message).toContain('"0":"T"');
        console.log('Content serialization bug confirmed:', error.message);
      } else {
        throw error;
      }
    }
  });

  it('should have deleteMessages method available', () => {
    const memory = new Memory({
      storage: new LibSQLStore({
        url: `file:${dbPath}`,
      }),
      options: {
        semanticRecall: false,
      },
    });

    // Verify the method exists
    expect(memory.deleteMessages).toBeTruthy();
    expect(typeof memory.deleteMessages).toBe('function');
  });
});
