import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LongMemEvalMetric, createLongMemEvalMetric } from '../longmemeval-metric';

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockImplementation(async ({ messages }) => {
          const content = messages[0].content;
          
          // Check if it's asking about correct response
          if (content.includes('Is the model response correct?')) {
            // If the model response contains the correct answer, return yes
            if (content.includes('Model Response: Blue') && content.includes('Correct Answer: Blue')) {
              return {
                choices: [{ message: { content: 'yes' } }],
              };
            }
            // If the response doesn't match, return no with reason
            return {
              choices: [{ message: { content: 'no: the model did not provide the correct answer' } }],
            };
          }
          
          // For abstention questions
          if (content.includes('Does the model correctly identify the question as unanswerable?')) {
            if (content.includes('cannot answer') || content.includes('don\'t have that information')) {
              return {
                choices: [{ message: { content: 'yes' } }],
              };
            }
            return {
              choices: [{ message: { content: 'no: the model attempted to answer an unanswerable question' } }],
            };
          }
          
          // Default response
          return {
            choices: [{ message: { content: 'yes' } }],
          };
        }),
      },
    },
  })),
}));

describe('LongMemEvalMetric', () => {
  describe('measure', () => {
    it('should return score 1 for correct answer', async () => {
      const metric = new LongMemEvalMetric({
        questionType: 'single-session-user',
      });

      const input = JSON.stringify({
        question: 'What is my favorite color?',
        answer: 'Blue',
      });
      const output = 'Blue';

      const result = await metric.measure(input, output);

      expect(result.score).toBe(1);
      expect(result.info?.questionType).toBe('single-session-user');
      expect(result.info?.evaluatorResponse).toBe('yes');
    });

    it('should return score 0 for incorrect answer', async () => {
      const metric = new LongMemEvalMetric({
        questionType: 'single-session-user',
      });

      const input = JSON.stringify({
        question: 'What is my favorite color?',
        answer: 'Blue',
      });
      const output = 'Red';

      const result = await metric.measure(input, output);

      expect(result.score).toBe(0);
      expect(result.info?.reason).toBe('the model did not provide the correct answer');
    });

    it('should handle abstention questions correctly', async () => {
      const metric = new LongMemEvalMetric({
        questionType: 'single-session-user',
        isAbstention: true,
      });

      const input = JSON.stringify({
        question: 'What is my favorite food?',
        answer: 'This question cannot be answered based on the conversation history',
      });
      const output = 'I cannot answer that question based on our conversation history.';

      const result = await metric.measure(input, output);

      expect(result.score).toBe(1);
      expect(result.info?.isAbstention).toBe(true);
    });

    it('should handle different question types', async () => {
      const temporalMetric = createLongMemEvalMetric('temporal-reasoning');
      const knowledgeMetric = createLongMemEvalMetric('knowledge-update');
      const preferenceMetric = createLongMemEvalMetric('single-session-preference');

      // All should be instances of LongMemEvalMetric
      expect(temporalMetric).toBeInstanceOf(LongMemEvalMetric);
      expect(knowledgeMetric).toBeInstanceOf(LongMemEvalMetric);
      expect(preferenceMetric).toBeInstanceOf(LongMemEvalMetric);
    });

    it('should throw error for unknown question type', async () => {
      expect(() => {
        new LongMemEvalMetric({
          questionType: 'invalid-type' as any,
        });
      }).not.toThrow(); // Constructor doesn't validate

      // The error would be thrown during measure when getting the prompt
      const metric = new LongMemEvalMetric({
        questionType: 'invalid-type' as any,
      });

      const input = JSON.stringify({
        question: 'Test question',
        answer: 'Test answer',
      });

      await expect(metric.measure(input, 'Test output')).rejects.toThrow('Unknown question type: invalid-type');
    });

    it('should parse evaluator response correctly', async () => {
      const metric = new LongMemEvalMetric({
        questionType: 'single-session-user',
      });

      const input = JSON.stringify({
        question: 'What is my name?',
        answer: 'John',
      });
      const output = 'I don\'t know your name';

      const result = await metric.measure(input, output);

      expect(result.score).toBe(0);
      expect(result.info?.evaluatorResponse).toContain('no');
      expect(result.info?.reason).toBeTruthy();
    });
  });

  describe('createLongMemEvalMetric', () => {
    it('should create metric with correct configuration', () => {
      const metric = createLongMemEvalMetric('multi-session', {
        model: 'gpt-4-turbo',
        apiKey: 'test-key',
      });

      expect(metric).toBeInstanceOf(LongMemEvalMetric);
    });
  });
});