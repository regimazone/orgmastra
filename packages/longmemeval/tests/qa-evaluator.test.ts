import { describe, it, expect, vi } from 'vitest';
import { QAEvaluator } from '../src/evaluation/qa-evaluator';
import type { LongMemEvalQuestion, EvaluationResult } from '../src/data/types';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: { content: 'yes' }
            }]
          })
        }
      }
    }))
  };
});

describe('QAEvaluator', () => {
  let evaluator: QAEvaluator;

  beforeAll(() => {
    evaluator = new QAEvaluator({ apiKey: 'test-key' });
  });

  describe('getEvalPrompt', () => {
    it('should generate correct prompt for single-session-user', () => {
      const prompt = (evaluator as any).getEvalPrompt(
        'single-session-user',
        'What is my name?',
        'John',
        'Your name is John',
        false
      );

      expect(prompt).toContain('Question: What is my name?');
      expect(prompt).toContain('Correct Answer: John');
      expect(prompt).toContain('Model Response: Your name is John');
    });

    it('should generate correct prompt for abstention', () => {
      const prompt = (evaluator as any).getEvalPrompt(
        'single-session-user',
        'What is my favorite movie?',
        'Information not provided',
        'I don\'t have that information',
        true
      );

      expect(prompt).toContain('unanswerable question');
      expect(prompt).toContain('Does the model correctly identify the question as unanswerable?');
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate correct metrics', () => {
      const results: EvaluationResult[] = [
        {
          question_id: '001',
          hypothesis: 'Answer 1',
          is_correct: true,
          question_type: 'single-session-user'
        },
        {
          question_id: '002',
          hypothesis: 'Answer 2',
          is_correct: false,
          question_type: 'single-session-user'
        },
        {
          question_id: '003_abs',
          hypothesis: 'I don\'t know',
          is_correct: true,
          question_type: 'single-session-user'
        }
      ];

      const metrics = evaluator.calculateMetrics(results);

      expect(metrics.overall_accuracy).toBe(2/3);
      expect(metrics.total_questions).toBe(3);
      expect(metrics.correct_answers).toBe(2);
      expect(metrics.abstention_accuracy).toBe(1);
      expect(metrics.accuracy_by_type['single-session-user'].accuracy).toBe(2/3);
    });
  });
});