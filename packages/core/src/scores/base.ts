import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createStep, createWorkflow } from '../workflows';
import { scoreResultSchema, scoringExtractStepResultSchema } from './types';

const analyzeStepResultSchema = z.object({
  result: z.record(z.string(), z.any()).optional(),
  prompt: z.string().optional(),
});

const scoreOnlySchema = z.number();

import type {
  PreprocessStepFn,
  InternalReasonStepFn,
  InternalAnalyzeStepFn,
  ScorerOptions,
  GenerateScoreStepFn,
  ScoringInput,
  ScoringInputWithPreprocessStepResultAndScoreAndReason,
  ScoringSamplingConfig,
} from './types';

export class MastraScorer {
  name: string;
  description: string;
  preprocess?: PreprocessStepFn;
  analyze: InternalAnalyzeStepFn;
  generateScore: GenerateScoreStepFn;
  reason?: InternalReasonStepFn;
  metadata?: Record<string, any>;
  isLLMScorer?: boolean;

  constructor(opts: ScorerOptions) {
    this.name = opts.name;
    this.description = opts.description;
    this.preprocess = opts.preprocess;
    this.analyze = opts.analyze;
    this.generateScore = opts.generateScore;
    this.reason = opts.reason;
    this.metadata = {};
    this.isLLMScorer = opts.isLLMScorer;

    if (opts.metadata) {
      this.metadata = opts.metadata;
    }
  }

  async run(input: ScoringInput): Promise<ScoringInputWithPreprocessStepResultAndScoreAndReason> {
    let runId = input.runId;
    if (!runId) {
      runId = randomUUID();
    }

    const preprocessStep = createStep({
      id: 'preprocess',
      description: 'Preprocess relevant element from the run',
      inputSchema: z.any(),
      outputSchema: scoringExtractStepResultSchema,
      execute: async ({ inputData }) => {
        if (!this.preprocess) {
          return;
        }

        const preprocessStepResult = await this.preprocess(inputData);

        return preprocessStepResult;
      },
    });

    const analyzeStep = createStep({
      id: 'analyze',
      description: 'Analyze the preprocessed element',
      inputSchema: scoringExtractStepResultSchema,
      outputSchema: analyzeStepResultSchema,
      execute: async ({ inputData }) => {
        const analyzeStepResult = await this.analyze({ ...input, runId, preprocessStepResult: inputData?.result });

        return analyzeStepResult;
      },
    });

    const generateScoreStep = createStep({
      id: 'generateScore',
      description: 'Generate score from analysis',
      inputSchema: analyzeStepResultSchema,
      outputSchema: scoreOnlySchema,
      execute: async ({ getStepResult }) => {
        const preprocessStepRes = getStepResult(preprocessStep);
        const analyzeStepRes = getStepResult(analyzeStep);

        const score = await this.generateScore({
          ...input,
          runId,
          preprocessStepResult: preprocessStepRes?.result,
          analyzeStepResult: analyzeStepRes?.result,
          analyzePrompt: analyzeStepRes?.prompt,
        });

        return score;
      },
    });

    const reasonStep = createStep({
      id: 'reason',
      description: 'Reason about the score',
      inputSchema: z.number(),
      outputSchema: z.any(),
      execute: async ({ getStepResult }) => {
        const analyzeStepRes = getStepResult(analyzeStep);
        const preprocessStepResult = getStepResult(preprocessStep);
        const scoreResult = getStepResult(generateScoreStep);

        if (!this.reason) {
          return {
            preprocessStepResult: preprocessStepResult?.result,
            analyzeStepResult: analyzeStepRes?.result,
            analyzePrompt: analyzeStepRes?.prompt,
            preprocessPrompt: preprocessStepResult?.prompt,
            score: scoreResult,
          };
        }

        const reasonResult = await this.reason({
          ...input,
          preprocessStepResult: preprocessStepResult?.result,
          analyzeStepResult: analyzeStepRes?.result,
          score: scoreResult,
          runId,
        });

        return {
          preprocessStepResult: preprocessStepResult?.result,
          analyzeStepResult: analyzeStepRes?.result,
          analyzePrompt: analyzeStepRes?.prompt,
          preprocessPrompt: preprocessStepResult?.prompt,
          score: scoreResult,
          ...(reasonResult?.reason ? { reason: reasonResult.reason } : {}),
          ...(reasonResult?.prompt ? { reasonPrompt: reasonResult.prompt } : {}),
        };
      },
    });

    const scoringPipeline = createWorkflow({
      id: `scoring-pipeline-${this.name}`,
      inputSchema: z.any(),
      outputSchema: z.any(),
      steps: [preprocessStep, analyzeStep, generateScoreStep, reasonStep],
    })
      .then(preprocessStep)
      .then(analyzeStep)
      .then(generateScoreStep)
      .then(reasonStep)
      .commit();

    const workflowRun = await scoringPipeline.createRunAsync();

    const execution = await workflowRun.start({
      inputData: input,
    });

    if (execution.status !== 'success') {
      throw new Error(
        `Scoring pipeline failed: ${execution.status}`,
        execution.status === 'failed' ? execution.error : undefined,
      );
    }

    return { runId, ...execution.result };
  }
}
export type MastraScorerEntry = {
  scorer: MastraScorer;
  sampling?: ScoringSamplingConfig;
};

export type MastraScorers = Record<string, MastraScorerEntry>;
