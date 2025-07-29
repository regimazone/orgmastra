import { z } from 'zod';
import {
  isAnalyzeConfig,
  isGenerateScoreConfig,
  isPreprocessConfig,
  isReasonConfig,
  type PreprocessStepFn,
  type ReasonStepFn,
  type ScoringInput,
  type ScoringInputWithExtractStepResult,
  type ScoringInputWithExtractStepResultAndAnalyzeStepResult,
  type ScoringInputWithExtractStepResultAndAnalyzeStepResultAndScore,
  type TypedScorerOptions,
} from './types';
import { MastraError } from '../error';
import { MastraScorer } from './base';
import { Agent } from '../agent';

export function createScorer<TPreprocessOutput = any, TAnalyzeOutput = any>(
  opts: TypedScorerOptions<TPreprocessOutput, TAnalyzeOutput>,
) {
  // Default judge for LLM steps
  const defaultJudge = opts.judge;

  return new MastraScorer({
    name: opts.name,
    description: opts.description,
    metadata: opts,

    // Preprocess step (optional)
    ...(opts.preprocess && {
      extract: async (run: ScoringInput) => {
        if (isPreprocessConfig(opts.preprocess!)) {
          const config = opts.preprocess;
          const judge = config.judge || defaultJudge;

          if (!judge) {
            throw new MastraError({
              id: 'PREPROCESS_STEP_NO_JUDGE_PROVIDED',
              domain: 'SCORER',
              category: 'USER',
              text: 'No judge provided for preprocess step when using LLM to preprocess the input.',
              details: {
                name: opts.name,
              },
            });
          }

          const llm = new Agent({
            name: `${opts.name}-preprocess`,
            instructions: judge.instructions,
            model: judge.model,
          });

          const prompt = config.createPrompt({ run });
          const result = await llm.generate(prompt, {
            output: config.outputSchema || z.record(z.any()),
          });

          return {
            result: result.object as TPreprocessOutput,
            prompt,
          };
        } else {
          // Function-based preprocessing
          const result = await (opts.preprocess as PreprocessStepFn<TPreprocessOutput>)(run);
          return {
            result: result as TPreprocessOutput,
          };
        }
      },
    }),

    // Analyze step (required)
    analyze: async (run: ScoringInputWithExtractStepResult<TPreprocessOutput>) => {
      let analyzeResult: { result: TAnalyzeOutput; prompt?: string };

      if (isAnalyzeConfig(opts.analyze)) {
        const config = opts.analyze;
        const judge = config.judge || defaultJudge;

        if (!judge) {
          throw new MastraError({
            id: 'ANALYZE_STEP_NO_JUDGE_PROVIDED',
            domain: 'SCORER',
            category: 'USER',
            text: 'No judge provided for analyze step when using LLM to analyze the input.',
            details: {
              name: opts.name,
            },
          });
        }

        const llm = new Agent({
          name: `${opts.name}-analyze`,
          instructions: judge.instructions,
          model: judge.model,
        });

        const prompt = config.createPrompt({ run });
        const result = await llm.generate(prompt, {
          output: config.outputSchema || z.record(z.any()),
        });

        analyzeResult = {
          result: result.object as TAnalyzeOutput,
          prompt,
        };
      } else {
        // Function-based analysis
        analyzeResult = await opts.analyze(run);
      }

      // Now generate the score
      const runWithAnalyzeResult: ScoringInputWithExtractStepResultAndAnalyzeStepResult<
        TPreprocessOutput,
        TAnalyzeOutput
      > = {
        ...run,
        analyzeStepResult: analyzeResult.result,
        analyzePrompt: analyzeResult.prompt,
      };

      let score: number;
      if (isGenerateScoreConfig(opts.generateScore)) {
        const config = opts.generateScore;
        const judge = config.judge || defaultJudge;

        if (!judge) {
          throw new MastraError({
            id: 'GENERATE_SCORE_STEP_NO_JUDGE_PROVIDED',
            domain: 'SCORER',
            category: 'USER',
            text: 'No judge provided for generate score step when using LLM to generate the score.',
            details: {
              name: opts.name,
            },
          });
        }

        const llm = new Agent({
          name: `${opts.name}-score`,
          instructions: judge.instructions,
          model: judge.model,
        });

        const prompt = config.createPrompt({ run: runWithAnalyzeResult });
        const result = await llm.generate(prompt, {
          output: config.outputSchema || z.number(),
        });

        score = typeof result.object === 'number' ? result.object : (result.object as any).score || 0;
      } else {
        // Function-based scoring
        const scoreResult = await opts.generateScore(runWithAnalyzeResult);
        score = typeof scoreResult === 'number' ? scoreResult : await scoreResult;
      }

      if (isAnalyzeConfig(opts.analyze)) {
        return {
          result: analyzeResult.result,
          score: score,
          prompt: analyzeResult.prompt,
        };
      }

      return {
        result: analyzeResult.result,
        score: score,
      };
    },

    // Reason step (optional)
    reason: opts.generateReason
      ? async (
          run: ScoringInputWithExtractStepResultAndAnalyzeStepResultAndScore<TPreprocessOutput, TAnalyzeOutput>,
        ) => {
          if (isReasonConfig(opts.generateReason!)) {
            const config = opts.generateReason;
            const judge = config.judge || defaultJudge;

            if (!judge) {
              throw new MastraError({
                id: 'REASON_STEP_NO_JUDGE_PROVIDED',
                domain: 'SCORER',
                category: 'USER',
                text: 'No judge provided for reason step when using LLM to generate the reason.',
                details: {
                  name: opts.name,
                },
              });
            }
            const llm = new Agent({
              name: `${opts.name}-reason`,
              instructions: judge.instructions,
              model: judge.model,
            });

            const prompt = config.createPrompt({ run });
            const result = await llm.generate(prompt, {
              output: z.object({
                reason: z.string(),
              }),
            });

            return {
              reason: result.object.reason,
            };
          } else {
            // Function-based reasoning
            return await (opts.generateReason as ReasonStepFn<TPreprocessOutput, TAnalyzeOutput>)(run);
          }
        }
      : undefined,
  });
}

createScorer({
  name: 'test',
  description: 'test',
  preprocess: {
    description: 'test',
    createPrompt: ({ run }) => {
      return 'test';
    },
    outputSchema: z.object({
      test: z.string(),
    }),
  },
  analyze: async run => {
    return {
      result: {
        a: 1,
      },
    };
  },
  generateScore: run => {
    return run.analyzeStepResult?.a || 0;
  },
  generateReason: async run => {
    return {
      reason: 'wtf',
    };
  },
});
