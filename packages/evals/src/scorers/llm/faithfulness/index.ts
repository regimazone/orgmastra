import { createLLMScorer } from '@mastra/core/eval';
import type { LanguageModel } from '@mastra/core/llm';

import {
  createFaithfulnessAnalyzePrompt,
  createFaithfulnessExtractPrompt,
  FAITHFULNESS_AGENT_INSTRUCTIONS,
  generateFaithfulnessReasonPrompt,
} from './prompts';
import { roundToTwoDecimals } from '../../utils';
import { z } from 'zod';

export interface FaithfulnessMetricOptions {
  scale?: number;
  context: string[];
}

export function createFaithfulnessScorer({
  model,
  options,
}: {
  model: LanguageModel;
  options?: FaithfulnessMetricOptions;
}) {
  return createLLMScorer({
    name: 'Faithfulness Scorer',
    description: 'A scorer that evaluates the faithfulness of an LLM output to an input',
    judge: {
      model,
      instructions: FAITHFULNESS_AGENT_INSTRUCTIONS,
    },
    extract: {
      description: 'Extract relevant statements from the LLM output',
      outputSchema: z.array(z.string()),
      createPrompt: ({ run }) => createFaithfulnessExtractPrompt({ output: run.output.content }),
    },
    analyze: {
      description: 'Score the relevance of the statements to the input',
      outputSchema: z.array(z.object({ result: z.string(), reason: z.string() })),
      createPrompt: ({ run }) =>
        createFaithfulnessAnalyzePrompt({ statements: run.extractStepResult || [], context: options?.context || [] }),
    },
    calculateScore: ({ run }) => {
      const totalClaims = run.analyzeStepResult.length;
      const supportedClaims = run.analyzeStepResult.filter(v => v.result === 'yes').length;

      if (totalClaims === 0) {
        return 0;
      }

      const score = (supportedClaims / totalClaims) * (options?.scale || 1);

      return roundToTwoDecimals(score);
    },
    reason: {
      description: 'Reason about the results',
      createPrompt: ({ run }) =>
        generateFaithfulnessReasonPrompt({
          input: run.input.map(input => input.content).join(', '),
          output: run.output.text,
          context: options?.context || [],
          score: run.score,
          scale: options?.scale || 1,
          results: run.analyzeStepResult || [],
        }),
    },
  });
}
