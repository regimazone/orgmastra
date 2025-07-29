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

export type ScoringInputWithExtractStepResult<TExtract = any> = ScoringInput & {
  runId: string;
  extractStepResult?: TExtract;
  extractPrompt?: string;
};

export type ScoringInputWithExtractStepResultAndAnalyzeStepResult<
  TExtract = any,
  TScore = any,
> = ScoringInputWithExtractStepResult<TExtract> & {
  score: number;
  analyzeStepResult?: TScore;
  analyzePrompt?: string;
};

export type ScoringInputWithExtractStepResultAndScoreAndReason =
  ScoringInputWithExtractStepResultAndAnalyzeStepResult & {
    reason?: string;
    reasonPrompt?: string;
  };

export type ScoreRowData = ScoringInputWithExtractStepResultAndScoreAndReason &
  ScoringHookInput & {
    id: string;
    entityId: string;
    scorerId: string;
    createdAt: Date;
    updatedAt: Date;
  };

export type ExtractionStepFn = (input: ScoringInput) => Promise<Record<string, any>>;

type LLMJudge = {
  model: MastraLanguageModel;
  instructions: string;
};

export type PreprocessStepFn = (input: ScoringInput) => Promise<Record<string, any>>;
export type PreprocessStepConfig = {
  description: string;
  judge?: LLMJudge;
  outputSchema?: z.ZodType<any>;
  createPrompt: ({ run }: { run: ScoringInput }) => string;
};

export type PreprocessStep = PreprocessStepFn | PreprocessStepConfig;

// Type guard helper
export function isPreprocessConfig(step: PreprocessStep): step is PreprocessStepConfig {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

export type AnalyzeStepFn = (input: ScoringInputWithExtractStepResult) => Promise<ScoringAnalyzeStepResult>;

export type AnalyzeStepConfig = {
  description: string;
  judge?: LLMJudge;
  outputSchema?: z.ZodType<any>;
  createPrompt: ({ run }: { run: ScoringInputWithExtractStepResult }) => string;
};

export type AnalyzeStep = AnalyzeStepFn | AnalyzeStepConfig;

// Type guard helper
export function isAnalyzeConfig(step: AnalyzeStep): step is AnalyzeStepConfig {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

export type ReasonStepFn = (
  input: ScoringInputWithExtractStepResultAndAnalyzeStepResult,
) => Promise<{ reason: string; reasonPrompt?: string } | null>;

export type ReasonStepConfig = {
  description: string;
  judge?: LLMJudge;
  createPrompt: ({ run }: { run: ScoringInputWithExtractStepResultAndAnalyzeStepResult }) => string;
};

export type ReasonStep = ReasonStepFn | ReasonStepConfig;

// Type guard helper
export function isReasonConfig(step: ReasonStep): step is ReasonStepConfig {
  return typeof step === 'object' && step !== null && 'createPrompt' in step;
}

export type ScorerOptions = {
  name: string;
  description: string;
  extract?: ExtractionStepFn;
  analyze: AnalyzeStepFn;
  reason?: ReasonStepFn;
  metadata?: Record<string, any>;
  isLLMScorer?: boolean;
};
