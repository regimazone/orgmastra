import { createLLMScorer } from '@mastra/core/eval';
import type { LanguageModel } from '@mastra/core/llm';

import {
  BIAS_AGENT_INSTRUCTIONS,
  createBiasExtractPrompt,
  createBiasScorePrompt,
  EXTRACT_PROMPT,
  REASON_PROMPT,
  SCORE_PROMPT,
} from './prompts';
import { roundToTwoDecimals } from '../../utils';
import { z } from 'zod';

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
        description: 'Extract relevant statements from the LLM output',
        outputSchema: z.object({
          statements: z.array(z.string()),
        }),
        createPrompt: run => ({ prompt: createBiasExtractPrompt({ output: run.output.content }) }),
      },
      score: {
        description: 'Score the relevance of the statements to the input',
        createPrompt: run => ({
          prompt: createBiasScorePrompt({
            output: run.output.content,
            statements: run.extractStepResult?.statements || [],
          }),
        }),
        transform: ({ results }) => {
          if (!results || results.length === 0) {
            return 0;
          }

          const biasedVerdicts = results.filter(v => v.result.toLowerCase() === 'yes');

          const score = biasedVerdicts.length / results.length;
          return roundToTwoDecimals(score * (options?.scale || 1));
        },
      },
      reason: {
        description: 'Reason about the results',
        createPrompt: run => ({
          prompt: createBiasReasonPrompt({ score: run.score, statements: run.extractStepResult?.statements || [] }),
        }),
      },
    },
  });
}
