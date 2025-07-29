import { z } from 'zod';
import type { MastraLanguageModel } from '../memory';

export type ScoringSamplingConfig = { type: 'none' } | { type: 'ratio'; rate: number };

export type ScoringSource = 'LIVE' | 'TEST';

export type ScoringEntityType = 'AGENT' | 'WORKFLOW';

export type ScoringPrompts = {
  description: string;
  prompt: string;
};

export type ScoringInput = {
  runId?: string;
  input?: Record<string, any>[];
  output: Record<string, any>;
  additionalContext?: Record<string, any>;
  runtimeContext?: Record<string, any>;
};

export type ScoringHookInput = {
  runId?: string;
  scorer: Record<string, any>;
  input: Record<string, any>[];
  output: Record<string, any>;
  metadata?: Record<string, any>;
  additionalContext?: Record<string, any>;
  source: ScoringSource;
  entity: Record<string, any>;
  entityType: ScoringEntityType;
  runtimeContext?: Record<string, any>;
  structuredOutput?: boolean;
  traceId?: string;
  resourceId?: string;
  threadId?: string;
};

export const scoringExtractStepResultSchema = z.record(z.string(), z.any()).optional();

export type ScoringExtractStepResult = z.infer<typeof scoringExtractStepResultSchema>;

export const scoringValueSchema = z.number();

export const scoreResultSchema = z.object({
  result: z.record(z.string(), z.any()).optional(),
  score: scoringValueSchema,
  prompt: z.string().optional(),
});

export type ScoringAnalyzeStepResult = z.infer<typeof scoreResultSchema>;

export type ScoringInputWithPreprocessStepResult<TPreprocess = any> = ScoringInput & {
  runId: string;
  preprocessStepResult?: TPreprocess;
  preprocessPrompt?: string;
};

export type ScoringInputWithPreprocessStepResultAndAnalyzeStepResult<
  TPreprocess = any,
  TAnalyze = any,
> = ScoringInputWithPreprocessStepResult<TPreprocess> & {
  analyzeStepResult?: TAnalyze;
  analyzePrompt?: string;
};

export type ScoringInputWithPreprocessStepResultAndAnalyzeStepResultAndScore<
  TPreprocess = any,
  TAnalyze = any,
> = ScoringInputWithPreprocessStepResultAndAnalyzeStepResult<TPreprocess, TAnalyze> & {
  score: number;
};

export type ScoringInputWithPreprocessStepResultAndScoreAndReason =
  ScoringInputWithPreprocessStepResultAndAnalyzeStepResultAndScore & {
    reason?: string;
    reasonPrompt?: string;
  };

export type ScoreRowData = ScoringInputWithPreprocessStepResultAndScoreAndReason &
  ScoringHookInput & {
    id: string;
    entityId: string;
    scorerId: string;
    createdAt: Date;
    updatedAt: Date;
  };

export type PreprocessStepFn<TOutput = any> = (input: ScoringInput) => Promise<TOutput>;

type LLMJudge = {
  model: MastraLanguageModel;
  instructions: string;
};

export type PreprocessStepConfig<TOutput = any> = {
  description: string;
  judge?: LLMJudge;
  outputSchema?: z.ZodType<TOutput>;
  createPrompt: ({ run }: { run: ScoringInput }) => string;
};

export type PreprocessStep<TOutput = any> = PreprocessStepFn<TOutput> | PreprocessStepConfig<TOutput>;

// Type guard helper
export function isPreprocessConfig<TOutput = any>(
  step: PreprocessStep<TOutput>,
): step is PreprocessStepConfig<TOutput> {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

export type AnalyzeStepFn<TPreprocessOutput = any, TAnalyzeOutput = any> = (
  input: ScoringInputWithPreprocessStepResult<TPreprocessOutput>,
) => Promise<TAnalyzeOutput>;

export type AnalyzeStepConfig<TPreprocessOutput = any, TAnalyzeOutput = any> = {
  description: string;
  judge?: LLMJudge;
  outputSchema?: z.ZodType<TAnalyzeOutput>;
  createPrompt: ({ run }: { run: ScoringInputWithPreprocessStepResult<TPreprocessOutput> }) => string;
};

export type AnalyzeStep<TPreprocessOutput = any, TAnalyzeOutput = any> =
  | AnalyzeStepFn<TPreprocessOutput, TAnalyzeOutput>
  | AnalyzeStepConfig<TPreprocessOutput, TAnalyzeOutput>;

// Type guard helper
export function isAnalyzeConfig<TPreprocessOutput = any, TAnalyzeOutput = any>(
  step: AnalyzeStep<TPreprocessOutput, TAnalyzeOutput>,
): step is AnalyzeStepConfig<TPreprocessOutput, TAnalyzeOutput> {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

export type GenerateScoreStepFn<TPreprocessOutput = any, TAnalyzeOutput = any> = (
  input: ScoringInputWithPreprocessStepResultAndAnalyzeStepResult<TPreprocessOutput, TAnalyzeOutput>,
) => Promise<number> | number;

export type GenerateScoreStepConfig<TPreprocessOutput = any, TAnalyzeOutput = any> = {
  description: string;
  judge?: LLMJudge;
  outputSchema?: z.ZodType<number>;
  createPrompt: ({
    run,
  }: {
    run: ScoringInputWithPreprocessStepResultAndAnalyzeStepResult<TPreprocessOutput, TAnalyzeOutput>;
  }) => string;
};

export type GenerateScoreStep<TPreprocessOutput = any, TAnalyzeOutput = any> =
  | GenerateScoreStepFn<TPreprocessOutput, TAnalyzeOutput>
  | GenerateScoreStepConfig<TPreprocessOutput, TAnalyzeOutput>;

// Type guard helper
export function isGenerateScoreConfig<TPreprocessOutput = any, TAnalyzeOutput = any>(
  step: GenerateScoreStep<TPreprocessOutput, TAnalyzeOutput>,
): step is GenerateScoreStepConfig<TPreprocessOutput, TAnalyzeOutput> {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

export type ReasonStepFn<TPreprocessOutput = any, TAnalyzeOutput = any> = (
  input: ScoringInputWithPreprocessStepResultAndAnalyzeStepResultAndScore<TPreprocessOutput, TAnalyzeOutput>,
) => Promise<string | null>;

export type ReasonStepConfig<TPreprocessOutput = any, TAnalyzeOutput = any> = {
  description: string;
  judge?: LLMJudge;
  createPrompt: ({
    run,
  }: {
    run: ScoringInputWithPreprocessStepResultAndAnalyzeStepResultAndScore<TPreprocessOutput, TAnalyzeOutput>;
  }) => string;
};

export type ReasonStep<TPreprocessOutput = any, TAnalyzeOutput = any> =
  | ReasonStepFn<TPreprocessOutput, TAnalyzeOutput>
  | ReasonStepConfig<TPreprocessOutput, TAnalyzeOutput>;

// Type guard helper
export function isReasonConfig<TPreprocessOutput = any, TAnalyzeOutput = any>(
  step: ReasonStep<TPreprocessOutput, TAnalyzeOutput>,
): step is ReasonStepConfig<TPreprocessOutput, TAnalyzeOutput> {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

// Internal types for the base class (with proper wrapping)
export type InternalAnalyzeStepFn = (
  input: ScoringInputWithPreprocessStepResult,
) => Promise<{ result: any; prompt?: string }>;

export type InternalReasonStepFn = (
  input: ScoringInputWithPreprocessStepResultAndAnalyzeStepResultAndScore,
) => Promise<{ reason: string; prompt?: string } | null>;

export type ScorerOptions = {
  name: string;
  description: string;
  preprocess?: PreprocessStepFn;
  analyze: InternalAnalyzeStepFn;
  generateScore: GenerateScoreStepFn;
  reason?: InternalReasonStepFn;
  metadata?: Record<string, any>;
  isLLMScorer?: boolean;
};

// New generic scorer options that support type flow with union types
export type TypedScorerOptions<TPreprocessOutput = any, TAnalyzeOutput = any> = {
  name: string;
  description: string;
  preprocess?: PreprocessStep<TPreprocessOutput>;
  analyze: AnalyzeStep<TPreprocessOutput, TAnalyzeOutput>;
  generateScore: GenerateScoreStep<TPreprocessOutput, TAnalyzeOutput>;
  generateReason?: ReasonStep<TPreprocessOutput, TAnalyzeOutput>;
  metadata?: Record<string, any>;
  judge?: LLMJudge;
};

// Backward compatibility aliases
// export type ExtractionStepFn = PreprocessStepFn;
// export type ScoringInputWithExtractStepResult<TExtract = any> = ScoringInputWithPreprocessStepResult<TExtract>;
// export type ScoringInputWithExtractStepResultAndAnalyzeStepResult<TExtract = any, TAnalyze = any> = ScoringInputWithPreprocessStepResultAndAnalyzeStepResult<TExtract, TAnalyze>;
// export type ScoringInputWithExtractStepResultAndAnalyzeStepResultAndScore<TExtract = any, TAnalyze = any> = ScoringInputWithPreprocessStepResultAndAnalyzeStepResultAndScore<TExtract, TAnalyze>;
// export type ScoringInputWithExtractStepResultAndScoreAndReason = ScoringInputWithPreprocessStepResultAndScoreAndReason;
