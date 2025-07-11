import { createLLMScorer } from '@mastra/core/eval';
import type { LanguageModel } from '@mastra/core/llm';

import {
  EXTRACT_PROMPT,
  FAITHFULNESS_AGENT_INSTRUCTIONS,
  generateFaithfulnessReasonPrompt,
  SCORE_PROMPT,
} from './prompts';
import { roundToTwoDecimals } from '../../utils';

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
    prompts: {
      extract: {
        prompt: EXTRACT_PROMPT,
        description: 'Extract relevant statements from the LLM output',
      },
      score: {
        prompt: SCORE_PROMPT,
        description: 'Score the relevance of the statements to the input',
        transform: ({ results }) => {
          const totalClaims = results.length;
          const supportedClaims = results.filter(v => v.result === 'yes').length;

          if (totalClaims === 0) {
            return { score: 0 };
          }

          const score = (supportedClaims / totalClaims) * (options?.scale || 1);

          return { score: roundToTwoDecimals(score), results };
        },
      },
      reason: {
        prompt: generateFaithfulnessReasonPrompt(options?.scale || 1),
        description: 'Reason about the results',
      },
    },
  });
}
