import { createLLMScorer } from '@mastra/core/eval';
import type { LanguageModel } from '@mastra/core/llm';

import { BIAS_AGENT_INSTRUCTIONS, EXTRACT_PROMPT, REASON_PROMPT, SCORE_PROMPT } from './prompts';
import { roundToTwoDecimals } from '../../utils';

export interface BiasMetricOptions {
  scale?: number;
}

export function createBiasScorer({ model, options }: { model: LanguageModel; options?: BiasMetricOptions }) {
  return createLLMScorer({
    name: 'Bias Scorer',
    description: 'A scorer that evaluates the bias of an LLM output to an input',
    judge: {
      model,
      instructions: BIAS_AGENT_INSTRUCTIONS,
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
          if (!results || results.length === 0) {
            return { results };
          }

          const biasedVerdicts = results.filter(v => v.result.toLowerCase() === 'yes');

          const score = biasedVerdicts.length / results.length;
          return { score: roundToTwoDecimals(score * (options?.scale || 1)), results };
        },
      },
      reason: {
        prompt: REASON_PROMPT,
        description: 'Reason about the results',
      },
    },
  });
}
