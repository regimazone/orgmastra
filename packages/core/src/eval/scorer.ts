import { z } from 'zod';
import { Agent } from '../agent';
import type { MastraLanguageModel } from '../memory';
import { createStep, createWorkflow } from '../workflows';
import { AvailableHooks, executeHook } from '../hooks';
import { get } from 'lodash-es';

export type SamplingConfig = { type: 'none' } | { type: 'ratio'; rate: number };

export type MastraScorer = {
  scorer: Scorer;
  sampling?: SamplingConfig;
};

export type Scorers = Record<string, MastraScorer>;

export type ScoringPrompts = {
  description: string;
  prompt: string;
};

export type ScoringRun = {
  runId: string;
  traceId?: string;
  scorer: Record<string, any>;
  input: Record<string, any>[];
  output: Record<string, any>;
  metadata?: Record<string, any>;
  additionalContext?: Record<string, any>;
  resourceId?: string;
  threadId?: string;
  source: ScoringSource;
  entity: Record<string, any>;
  entityType: ScoringEntityType;
  runtimeContext: Record<string, any>;
  structuredOutput?: boolean;
};

export const extractStepResultSchema = z.record(z.string(), z.any());

export type ExtractStepResult = z.infer<typeof extractStepResultSchema>;

export const scoreSchema = z.number();

const resultSchema = z.array(
  z.object({
    result: z.string(),
    reason: z.string(),
  }),
);

const scoreResultSchema = z.object({
  score: z.number().optional(),
  results: resultSchema.optional(),
  extractStepResult: extractStepResultSchema.optional(),
  scoreStepResult: z.any().optional(),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

export type ScoringRunWithExtractStepResult<TExtract = any> = ScoringRun & {
  extractStepResult?: TExtract;
};

export type ScoringRunWithExtractStepResultAndScore<
  TExtract = any,
  TScore = any,
> = ScoringRunWithExtractStepResult<TExtract> & {
  score?: number;
  results?: z.infer<typeof resultSchema>;
  scoreStepResult?: TScore;
};

export type ScoringRunWithExtractStepResultAndScoreAndReason = ScoringRunWithExtractStepResultAndScore & {
  reason: string;
};

export type ScoreRowData = ScoringRunWithExtractStepResultAndScoreAndReason & {
  id: string;
  entityId: string;
  scorerId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ExtractionStepFn = (run: ScoringRun) => Promise<Record<string, any>>;
export type ScoreStepFn = (run: ScoringRunWithExtractStepResult) => Promise<ScoreResult>;
export type ReasonStepFn = (run: ScoringRunWithExtractStepResultAndScore) => Promise<{ reason: string } | null>;

export type ScorerOptions = {
  name: string;
  description: string;
  extract: ExtractionStepFn;
  score: ScoreStepFn;
  reason?: ReasonStepFn;
  metadata?: Record<string, any>;
};

export class Scorer {
  name: string;
  description: string;
  extract: ExtractionStepFn;
  score: ScoreStepFn;
  reason?: ReasonStepFn;
  metadata?: Record<string, any>;

  constructor(opts: ScorerOptions) {
    this.name = opts.name;
    this.description = opts.description;
    this.extract = opts.extract;
    this.score = opts.score;
    this.reason = opts.reason;
    this.metadata = {};

    if (opts.metadata) {
      this.metadata = opts.metadata;
    }
  }

  async evaluate(run: ScoringRun): Promise<ScoringRunWithExtractStepResultAndScoreAndReason> {
    const extractStep = createStep({
      id: 'extract',
      description: 'Extract relevant element from the run',
      inputSchema: z.any(),
      outputSchema: extractStepResultSchema,
      execute: async ({ inputData }) => {
        return this.extract(inputData);
      },
    });

    const scoreStep = createStep({
      id: 'score',
      description: 'Score the extracted element',
      inputSchema: extractStepResultSchema,
      outputSchema: scoreResultSchema,
      execute: async ({ inputData }) => {
        const scoreResult = await this.score({ ...run, extractStepResult: inputData });

        return { ...scoreResult, extractStepResult: inputData };
      },
    });

    const reasonStep = createStep({
      id: 'reason',
      description: 'Reason about the score',
      inputSchema: scoreResultSchema,
      outputSchema: z.any(),
      execute: async ({ inputData, getStepResult }) => {
        if (!this.reason) {
          return {
            extractStepResult: getStepResult(extractStep),
            score: inputData.score,
          };
        }

        const reasonResult = await this.reason({ ...run, ...inputData, score: inputData.score });

        return {
          extractStepResult: getStepResult(extractStep),
          score: inputData.score,
          ...reasonResult,
        };
      },
    });

    const scoringPipeline = createWorkflow({
      id: `scoring-pipeline-${this.name}`,
      inputSchema: z.any(),
      outputSchema: z.any(),
      steps: [extractStep, scoreStep],
    })
      .then(extractStep)
      .then(scoreStep)
      .then(reasonStep)
      .commit();

    const workflowRun = await scoringPipeline.createRunAsync();

    const execution = await workflowRun.start({
      inputData: run,
    });

    if (execution.status !== 'success') {
      throw new Error(
        `Scoring pipeline failed: ${execution.status}`,
        execution.status === 'failed' ? execution.error : undefined,
      );
    }

    return { ...run, ...execution.result };
  }
}

export function createScorer(opts: ScorerOptions) {
  const scorer = new Scorer({
    name: opts.name,
    description: opts.description,
    extract: opts.extract,
    score: opts.score,
    reason: opts.reason,
  });

  return scorer;
}

type LLMJudge = {
  model: MastraLanguageModel;
  instructions: string;
};

export type LLMScorerOptions<TExtractOutput extends Record<string, any> = any, TScoreOutput = any> = {
  name: string;
  description: string;
  judge: LLMJudge;
  prompts: {
    extract: {
      description: string;
      judge?: LLMJudge;
      outputSchema: z.ZodType<TExtractOutput>;
      createPrompt: (run: ScoringRun) => { prompt: string };
    };
    score: {
      description: string;
      judge?: LLMJudge;
      outputSchema: z.ZodType<TScoreOutput>;
      createPrompt: (run: ScoringRun & { extractStepResult?: TExtractOutput }) => { prompt: string };
      transform?: ({ results }: { results: z.infer<typeof resultSchema> }) => z.infer<typeof scoreSchema>;
    };
    reason?: {
      description: string;
      judge?: LLMJudge;
      outputSchema: z.ZodType<{ score: number; reason: string }>;
      createPrompt: (
        run: ScoringRun & { extractStepResult?: TExtractOutput; scoreStepResult?: TScoreOutput; score?: number },
      ) => { prompt: string };
    };
  };
};

export function createLLMScorer<TExtractOutput extends Record<string, any> = any, TScoreOutput = any>(
  opts: LLMScorerOptions<TExtractOutput, TScoreOutput>,
) {
  const model = opts.judge.model;

  const llm = new Agent({
    name: opts.name,
    instructions: opts.description,
    model: model,
  });

  const hasReason = !!opts.prompts.reason;

  const scorer = new Scorer({
    name: opts.name,
    description: opts.description,
    metadata: opts,
    extract: async run => {
      const extractPrompt = await llm.generate(opts.prompts.extract.createPrompt(run).prompt, {
        output: opts.prompts.extract.outputSchema,
      });

      return extractPrompt.object as Record<string, any>;
    },
    score: async run => {
      // Rename extractedElements to extractStepResult for clarity
      const runWithExtractResult = {
        ...run,
        extractStepResult: run.extractStepResult,
      };

      const scorePrompt = await llm.generate(opts.prompts.score.createPrompt(runWithExtractResult as any).prompt, {
        output: opts.prompts.score.outputSchema,
      });

      if (opts.prompts.score.transform) {
        const scoreValue = opts.prompts.score.transform({ results: scorePrompt.object as any });
        return {
          score: scoreValue,
          scoreStepResult: scorePrompt.object,
          extractStepResult: run.extractStepResult,
        };
      }

      return {
        scoreStepResult: scorePrompt.object,
        extractStepResult: run.extractStepResult,
      };
    },
    reason: hasReason
      ? async run => {
          // Prepare run with both extract and score results
          const runWithAllResults = {
            ...run,
            extractStepResult: run.extractStepResult,
            scoreStepResult: run.scoreStepResult, // Use results as fallback
            score: run.score,
          };

          const reasonPromptTemplate = opts.prompts.reason?.createPrompt(runWithAllResults as any).prompt!;
          const reasonPrompt = await llm.generate(reasonPromptTemplate, {
            output:
              opts.prompts.reason?.outputSchema ||
              z.object({
                reason: z.string(),
                score: z.number().optional(),
              }),
          });

          return reasonPrompt.object;
        }
      : undefined,
  });

  return scorer;
}

export type ScoringSource = 'LIVE';
export type ScoringEntityType = 'AGENT' | 'WORKFLOW';

export function runScorer({
  runId,
  scorerId,
  scorerObject,
  input,
  output,
  runtimeContext,
  entity,
  structuredOutput,
  source,
  entityType,
}: {
  scorerId: string;
  scorerObject: MastraScorer;
  runId: string;
  input: Record<string, any>[];
  output: Record<string, any>;
  runtimeContext: Record<string, any>;
  entity: Record<string, any>;
  structuredOutput: boolean;
  source: ScoringSource;
  entityType: ScoringEntityType;
}) {
  let shouldExecute = false;

  if (!scorerObject?.sampling || scorerObject?.sampling?.type === 'none') {
    shouldExecute = true;
  }

  if (scorerObject?.sampling?.type) {
    switch (scorerObject?.sampling?.type) {
      case 'ratio':
        shouldExecute = Math.random() < scorerObject?.sampling?.rate;
        break;
      default:
        shouldExecute = true;
    }
  }

  if (!shouldExecute) {
    return;
  }

  const payload: ScoringRun = {
    scorer: {
      id: scorerId,
      name: scorerObject.scorer.name,
      description: scorerObject.scorer.description,
    },
    input,
    output,
    runtimeContext: Object.fromEntries(runtimeContext.entries()),
    runId,
    source,
    entity,
    structuredOutput,
    entityType,
  };

  console.log('payload', payload);

  executeHook(AvailableHooks.ON_SCORER_RUN, payload);
}
