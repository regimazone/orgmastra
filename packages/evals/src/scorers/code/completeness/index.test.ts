import { describe, it, expect } from 'vitest';

import { completenessScorer } from './index';

describe('CompletenessMetric', () => {
  describe('basic functionality', () => {
    it('should return high score for identical text', async () => {
      const text = 'The quick brown fox jumps over the lazy dog';

      const result = await completenessScorer.evaluate({
        input: [{ role: 'user', content: text }],
        output: { text },
        structuredOutput: false,
      });

      expect(result.score).toBe(1.0);
      expect(result.extractedElements).toBeDefined();
    });

    // it('should return lower score for simplified text missing elements', async () => {
    //     const original = 'The quick brown fox jumps over the lazy dog';
    //     const simplified = 'The fox jumps over the dog';
    //     const result = await metric.measure(original, simplified);

    //     expect(result.score).toBeLessThan(1.0);
    //     expect(result.score).toBeGreaterThan(0.5);
    //     expect(result.info?.missingElements).toContain('brown');
    //     expect(result.info?.missingElements).toContain('lazy');
    // });

    // it('should handle completely different texts', async () => {
    //     const original = 'The weather is sunny today';
    //     const simplified = 'I like to eat pizza';
    //     const result = await metric.measure(original, simplified);

    //     expect(result.score).toBeLessThan(0.3);
    //     const { input, output } = result.info?.elementCounts as { input: number; output: number };
    //     expect(input).toBeGreaterThan(0);
    //     expect(output).toBeGreaterThan(0);
    // });
  });

  // describe('edge cases', () => {
  //     it('should handle both empty strings', async () => {
  //         const result = await metric.measure('', '');
  //         expect(result.score).toBe(1);
  //         const { input, output } = result.info?.elementCounts as { input: number; output: number };
  //         expect(input).toBe(0);
  //         expect(output).toBe(0);
  //     });

  //     it('should handle empty original string', async () => {
  //         const result = await metric.measure('', 'some text');
  //         expect(result.score).toBe(0);
  //     });

  //     it('should handle whitespace-only strings', async () => {
  //         const result = await metric.measure('   \n  ', '  \n  ');
  //         expect(result.score).toBe(1);
  //         const { input, output } = result.info?.elementCounts as { input: number; output: number };
  //         expect(input).toBe(0);
  //         expect(output).toBe(0);
  //     });

  //     it('should handle null and undefined inputs', async () => {
  //         // @ts-expect-error Testing invalid input
  //         await expect(metric.measure(null, '')).rejects.toThrow();
  //         // @ts-expect-error Testing invalid input
  //         await expect(metric.measure('', undefined)).rejects.toThrow();
  //     });
  // });

  // describe('special cases', () => {
  //     it('should handle lists and enumerations', async () => {
  //         const result = await metric.measure('apples, oranges, and bananas', 'apples and bananas');
  //         expect(result.score).toBeLessThan(0.8);
  //         expect(result.info?.missingElements).toContain('oranges');
  //     });

  //     it('should handle repeated elements', async () => {
  //         const result = await metric.measure('cat cat cat cats', 'cat cats');
  //         expect(result.score).toBeGreaterThan(0.7);
  //     });

  //     it('should handle long and multi-paragraph text', async () => {
  //         const original = `First paragraph about AI.
  //     Second paragraph about ML.
  //     Third paragraph about DL.`;
  //         const simplified = `First para about AI.
  //     Second para about ML.`;
  //         const result = await metric.measure(original, simplified);

  //         expect(result.score).toBeGreaterThan(0.5);
  //         expect(result.info?.missingElements).toBeDefined();
  //     });
  // });
});
