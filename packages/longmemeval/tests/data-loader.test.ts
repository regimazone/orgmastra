import { describe, it, expect, beforeAll } from 'vitest';
import { DatasetLoader } from '../src/data/loader';
import type { LongMemEvalQuestion } from '../src/data/types';

describe('DatasetLoader', () => {
  let loader: DatasetLoader;

  beforeAll(() => {
    loader = new DatasetLoader();
  });

  describe('validateDataset', () => {
    it('should validate correct dataset structure', () => {
      const validData: LongMemEvalQuestion[] = [{
        question_id: 'test_001',
        question_type: 'single-session-user',
        question: 'What is my favorite color?',
        answer: 'Blue',
        question_date: '2024-01-01',
        haystack_session_ids: ['session_1'],
        haystack_dates: ['2024-01-01'],
        haystack_sessions: [[
          { role: 'user', content: 'My favorite color is blue.' },
          { role: 'assistant', content: 'I understand your favorite color is blue.' }
        ]],
        answer_session_ids: ['session_1']
      }];

      // Should not throw
      expect(() => {
        // Access private method through any type
        (loader as any).validateDataset(validData);
      }).not.toThrow();
    });

    it('should throw on invalid dataset structure', () => {
      const invalidData = [{
        question_id: 'test_001',
        // Missing required fields
      }];

      expect(() => {
        (loader as any).validateDataset(invalidData);
      }).toThrow('Missing required field');
    });
  });

  describe('loadDataset', () => {
    it('should throw helpful error when dataset file not found', async () => {
      await expect(
        loader.loadDataset('longmemeval_s')
      ).rejects.toThrow('Dataset file not found');
    });
  });
});