import { z } from 'zod';
import { Agent } from '../agent';
import type { MastraLanguageModel } from '../memory';
import { createStep, createWorkflow } from '../workflows';
import { AvailableHooks, executeHook } from '../hooks';

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

export const extractedElementsSchema = z.record(z.string(), z.any());

export type ExtractedElements = z.infer<typeof extractedElementsSchema>;

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
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

export type ScoringRunWithExtractedElement = ScoringRun & { extractedElements: ExtractedElements };

export type ScoringRunWithExtractedElementAndScore = ScoringRunWithExtractedElement & ScoreResult;

export const reasonResultSchema = z.object({
  reason: z.string(),
});

export type ReasonResult = z.infer<typeof reasonResultSchema>;

export type ScoringRunWithExtractedElementAndScoreAndReason = ScoringRunWithExtractedElementAndScore & ReasonResult;

export type ScoreRowData = ScoringRunWithExtractedElementAndScoreAndReason & {
  id: string;
  entityId: string;
  scorerId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ExtractionStepFn = (run: ScoringRun) => Promise<ExtractedElements>;
export type ScoreStepFn = (run: ScoringRunWithExtractedElement) => Promise<ScoreResult>;
export type ReasonStepFn = (run: ScoringRunWithExtractedElementAndScore) => Promise<ReasonResult | null>;

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

  async evaluate(run: ScoringRun): Promise<ScoringRunWithExtractedElementAndScoreAndReason> {
    const extractStep = createStep({
      id: 'extract',
      description: 'Extract relevant element from the run',
      inputSchema: z.any(),
      outputSchema: extractedElementsSchema,
      execute: async ({ inputData }) => {
        return this.extract(inputData);
      },
    });

    const scoreStep = createStep({
      id: 'score',
      description: 'Score the extracted element',
      inputSchema: extractedElementsSchema,
      outputSchema: scoreResultSchema,
      execute: async ({ inputData }) => {
        return this.score({ ...run, extractedElements: inputData });
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
            extractedElements: getStepResult(extractStep),
            score: inputData.score,
          };
        }

        const reasonResult = await this.reason({ ...run, extractedElements: inputData, score: inputData.score });

        return {
          extractedElements: getStepResult(extractStep),
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

export type LLMScorerOptions = {
  name: string;
  description: string;
  judge: LLMJudge;
  prompts: {
    extract: {
      prompt: string;
      description: string;
      judge?: LLMJudge;
    };
    score: {
      prompt: string;
      description: string;
      judge?: LLMJudge;
      transform?: ({ results }: { results: z.infer<typeof resultSchema> }) => z.infer<typeof scoreResultSchema>;
    };
    reason?: {
      prompt: string;
      description: string;
      judge?: LLMJudge;
    };
  };
};

export function renderTemplate(template: string, params: Record<string, any> = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined
      ? typeof params[key] === 'string'
        ? params[key]
        : JSON.stringify(params[key])
      : match;
  });
}

export function createLLMScorer(opts: LLMScorerOptions) {
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
      const extractPrompt = await llm.generate(
        renderTemplate(opts.prompts.extract.prompt, {
          ...run,
        }),
        {
          output: z.object({
            extractedElements: z.object({
              statements: z.array(z.string()),
            }),
          }),
        },
      );

      return extractPrompt.object.extractedElements;
    },
    score: async run => {
      const scorePrompt = await llm.generate(
        renderTemplate(opts.prompts.score.prompt, {
          statements: run.extractedElements.statements,
          ...run,
        }),
        {
          output: resultSchema,
        },
      );

      if (opts.prompts.score.transform) {
        return opts.prompts.score.transform({ results: scorePrompt.object });
      }

      return { results: scorePrompt.object };
    },
    reason: hasReason
      ? async run => {
          const reasonPromptTemplate = opts.prompts.reason?.prompt!;
          const reasonPrompt = await llm.generate(
            renderTemplate(reasonPromptTemplate, {
              ...run,
            }),
            {
              output: z.object({
                reason: z.string(),
              }),
            },
          );

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
