import type { CoreMessage, UIMessage } from 'ai';
import { z } from 'zod';
import { createStep, createWorkflow } from '../workflows';
import type { MastraLanguageModel } from '../memory';

export type ScoringPrompts = {
  description: string;
  prompt: string;
};

export type ScoringRun = {
  input: CoreMessage[];
  output: Record<string, any>;
  structuredOutput?: boolean;
};

export const extractedElementsSchema = z.record(z.string(), z.any());

export type ExtractedElements = z.infer<typeof extractedElementsSchema>;

const scoreResultSchema = z.object({
  score: z.number(),
  results: z
    .array(
      z.object({
        result: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

export type ScoringRunWithExtractedElement = ScoringRun & { extractedElements: ExtractedElements };

export type ScoringRunWithExtractedElementAndScore = ScoringRunWithExtractedElement & ScoreResult;

export type ScoringRunWithExtractedElementAndScoreAndReason = ScoringRunWithExtractedElementAndScore & {
  reason: string;
};

export type ExtractionStepFn = (run: ScoringRun) => Promise<Record<string, any>>;
export type ScoreStepFn = (run: ScoringRunWithExtractedElement) => Promise<ScoreResult>;
export type ReasonStepFn = (
  run: ScoringRunWithExtractedElementAndScore,
) => Promise<ScoringRunWithExtractedElementAndScoreAndReason | null>;

export type ScorerOptions = {
  name: string;
  description: string;
  extract: ExtractionStepFn;
  score: ScoreStepFn;
  reason?: ReasonStepFn;
};
export class Scorer {
  name: string;
  description: string;
  extract: ExtractionStepFn;
  score: ScoreStepFn;
  reason?: ReasonStepFn;

  constructor(opts: ScorerOptions) {
    this.name = opts.name;
    this.description = opts.description;
    this.extract = opts.extract;
    this.score = opts.score;
    this.reason = opts.reason;
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
          reason: reasonResult,
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

    return execution.result as ScoringRunWithExtractedElementAndScoreAndReason;
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
    };
    reason?: {
      prompt: string;
      description: string;
      judge?: LLMJudge;
    };
  };
};

export function createLLMScorer(opts: LLMScorerOptions) {
  console.log(opts);
  return null;
}

// export abstract class Scorer {
//   abstract name: string;
//   abstract description: string;

//   abstract extract(run: ScoringRun): Promise<ScoringRunWithExtractedElement>;

//   abstract score(run: ScoringRunWithExtractedElement): Promise<ScoringRunWithExtractedElementAndScore>;

//   async reason(_run: ScoringRunWithExtractedElementAndScore): Promise<ScoringRunWithExtractedElementAndScoreAndReason | null> {
//     return null;
//   }

//   async evaluate(run: ScoringRun): Promise<ScoringRunWithExtractedElementAndScoreAndReason> {
//     console.log(run);
//     return null as any;
//   }
// }

export type ScoringSource = 'LIVE';
export type ScoringEntityType = 'AGENT';

export type ScorerHookData = {
  runId: string;
  traceId?: string;
  scorer: Record<string, any>;
  input: UIMessage[];
  output: Record<string, any>;
  additionalContext?: Record<string, any>;
  resourceId?: string;
  threadId?: string;
  source: ScoringSource;
  entity: Record<string, any>;
  entityType: ScoringEntityType;
  runtimeContext: Record<string, any>;
  structuredOutput?: boolean;
};

export type ScoreRowData = {
  id: string;
  traceId?: string;
  runId: string;
  scorer: Record<string, any>;
  result: Record<string, any>;
  metadata?: Record<string, any>;
  input: Record<string, any>; // MESSAGE INPUT
  output: Record<string, any>; // MESSAGE OUTPUT
  additionalLLMContext?: Record<string, any>; // DATA FROM THE CONTEXT PARAM ON AN AGENT
  runtimeContext?: Record<string, any>; // THE EVALUATE RUNTIME CONTEXT FOR THE RUN
  entityType: string; // WORKFLOW, AGENT, TOOL, STEP, NETWORK
  entity: Record<string, any>; // MINIMAL JSON DATA ABOUT WORKFLOW, AGENT, TOOL, STEP, NETWORK
  entityId: string;
  source: string;
  resourceId?: string;
  threadId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ScorerPrompt = Record<string, ScoringPrompts> & {
  extract: ScoringPrompts;
  score: ScoringPrompts;
  reason: ScoringPrompts;
};

export abstract class LLMScorer extends Scorer {
  abstract prompts(): ScorerPrompt;
}
