// ================================
// CORE TYPES
// ================================

import type { LanguageModel } from '../llm';
import { z } from 'zod';

// Pipeline metadata
interface ScorerConfig {
  name: string;
  description: string;
  judge?: {
    model: LanguageModel;
    instructions: string;
  };
}

// Standardized input type for all pipelines
interface ScorerRun {
  runId?: string;
  input?: Record<string, any>[];
  output: Record<string, any>;
  runtimeContext?: Record<string, any>;
}

// Helper types
type StepResultKey<T extends string> = `${T}StepResult`;
type AccumulatedResults<T extends Record<string, any>, K extends string, V> = T & Record<StepResultKey<K>, V>;
type StepContext<TAccumulated extends Record<string, any>, TRun> = {
  run: TRun;
  results: TAccumulated;
};

// Special context type for generateReason that includes the score
type GenerateReasonContext<TAccumulated extends Record<string, any>> = StepContext<TAccumulated, ScorerRun> & {
  score: TAccumulated extends Record<'generateScoreStepResult', infer TScore> ? TScore : never;
};

// Conditional type for PromptObject context
type PromptObjectContext<
  TAccumulated extends Record<string, any>,
  TStepName extends string,
> = TStepName extends 'generateReason' ? GenerateReasonContext<TAccumulated> : StepContext<TAccumulated, ScorerRun>;

// Prompt object definition with conditional typing
interface PromptObject<TOutput, TAccumulated extends Record<string, any>, TStepName extends string = string> {
  description: string;
  outputSchema: z.ZodSchema<TOutput>;
  createPrompt: (context: PromptObjectContext<TAccumulated, TStepName>) => string;
}

class MastraNewScorer<TAccumulatedResults extends Record<string, any> = {}> {
  constructor(
    private metadata: ScorerConfig,
    private steps: Array<{
      name: string;
      execute: (context: any) => any;
      isPromptObject: boolean;
      description?: string;
    }> = [],
    private originalPromptObjects: Map<string, PromptObject<any, any, any>> = new Map(),
  ) {}

  // Getter for pipeline name
  get name(): string {
    return this.metadata.name;
  }

  // Getter for pipeline description
  get description(): string {
    return this.metadata.description;
  }

  // Check if generateScore exists
  private get hasGenerateScore(): boolean {
    return this.steps.some(step => step.name === 'generateScore');
  }

  preprocess<TPreprocessOutput>(
    stepDef:
      | ((context: StepContext<TAccumulatedResults, ScorerRun>) => TPreprocessOutput)
      | PromptObject<TPreprocessOutput, TAccumulatedResults, 'preprocess'>,
  ): MastraNewScorer<AccumulatedResults<TAccumulatedResults, 'preprocess', TPreprocessOutput>> {
    const isPromptObj = this.isPromptObject(stepDef);

    if (isPromptObj) {
      const promptObj = stepDef as PromptObject<TPreprocessOutput, TAccumulatedResults, 'preprocess'>;
      this.originalPromptObjects.set('preprocess', promptObj);
    }

    return new MastraNewScorer(
      this.metadata,
      [
        ...this.steps,
        {
          name: 'preprocess',
          execute: isPromptObj
            ? this.createPromptExecutor(stepDef as PromptObject<TPreprocessOutput, TAccumulatedResults, 'preprocess'>)
            : (stepDef as (context: StepContext<any, ScorerRun>) => TPreprocessOutput),
          isPromptObject: isPromptObj,
          description: isPromptObj
            ? (stepDef as PromptObject<TPreprocessOutput, TAccumulatedResults, 'preprocess'>).description
            : undefined,
        },
      ],
      new Map(this.originalPromptObjects),
    );
  }

  analyze<TAnalyzeOutput>(
    stepDef:
      | ((context: StepContext<TAccumulatedResults, ScorerRun>) => TAnalyzeOutput)
      | PromptObject<TAnalyzeOutput, TAccumulatedResults, 'analyze'>,
  ): MastraNewScorer<AccumulatedResults<TAccumulatedResults, 'analyze', TAnalyzeOutput>> {
    const isPromptObj = this.isPromptObject(stepDef);

    if (isPromptObj) {
      const promptObj = stepDef as PromptObject<TAnalyzeOutput, TAccumulatedResults, 'analyze'>;
      this.originalPromptObjects.set('analyze', promptObj);
    }

    return new MastraNewScorer(
      this.metadata,
      [
        ...this.steps,
        {
          name: 'analyze',
          execute: isPromptObj
            ? this.createPromptExecutor(stepDef as PromptObject<TAnalyzeOutput, TAccumulatedResults, 'analyze'>)
            : (stepDef as (context: StepContext<any, ScorerRun>) => TAnalyzeOutput),
          isPromptObject: isPromptObj,
          description: isPromptObj
            ? (stepDef as PromptObject<TAnalyzeOutput, TAccumulatedResults, 'analyze'>).description
            : undefined,
        },
      ],
      new Map(this.originalPromptObjects),
    );
  }

  generateScore<TScoreOutput extends number>(
    stepDef:
      | ((context: StepContext<TAccumulatedResults, ScorerRun>) => TScoreOutput)
      | PromptObject<TScoreOutput, TAccumulatedResults, 'generateScore'>,
  ): MastraNewScorer<AccumulatedResults<TAccumulatedResults, 'generateScore', TScoreOutput>> {
    const isPromptObj = this.isPromptObject(stepDef);

    if (isPromptObj) {
      const promptObj = stepDef as PromptObject<TScoreOutput, TAccumulatedResults, 'generateScore'>;
      this.originalPromptObjects.set('generateScore', promptObj);
    }

    return new MastraNewScorer(
      this.metadata,
      [
        ...this.steps,
        {
          name: 'generateScore',
          execute: isPromptObj
            ? this.createPromptExecutor(stepDef as PromptObject<TScoreOutput, TAccumulatedResults, 'generateScore'>)
            : (stepDef as (context: StepContext<any, ScorerRun>) => TScoreOutput),
          isPromptObject: isPromptObj,
          description: isPromptObj
            ? (stepDef as PromptObject<TScoreOutput, TAccumulatedResults, 'generateScore'>).description
            : undefined,
        },
      ],
      new Map(this.originalPromptObjects),
    );
  }

  generateReason<TReasonOutput>(
    stepDef:
      | ((context: GenerateReasonContext<TAccumulatedResults>) => TReasonOutput)
      | PromptObject<TReasonOutput, TAccumulatedResults, 'generateReason'>,
  ): MastraNewScorer<AccumulatedResults<TAccumulatedResults, 'generateReason', TReasonOutput>> {
    // Runtime check: generateReason only allowed after generateScore
    if (!this.hasGenerateScore) {
      throw new Error(`Pipeline "${this.metadata.name}": generateReason() can only be called after generateScore()`);
    }

    const isPromptObj = this.isPromptObject(stepDef);

    if (isPromptObj) {
      const promptObj = stepDef as PromptObject<TReasonOutput, TAccumulatedResults, 'generateReason'>;
      this.originalPromptObjects.set('generateReason', promptObj);
    }

    return new MastraNewScorer(
      this.metadata,
      [
        ...this.steps,
        {
          name: 'generateReason',
          execute: isPromptObj
            ? this.createPromptExecutor(stepDef as PromptObject<TReasonOutput, TAccumulatedResults, 'generateReason'>)
            : (stepDef as (context: GenerateReasonContext<any>) => TReasonOutput),
          isPromptObject: isPromptObj,
          description: isPromptObj
            ? (stepDef as PromptObject<TReasonOutput, TAccumulatedResults, 'generateReason'>).description
            : undefined,
        },
      ],
      new Map(this.originalPromptObjects),
    );
  }

  run(
    input: ScorerRun,
    options: {
      llmCall?: (prompt: string, schema: z.ZodSchema<any>) => any;
      logPrompts?: boolean;
    } = {},
  ): {
    input: ScorerRun;
    results: TAccumulatedResults;
    finalResult: any;
    generatedPrompts: Array<{ stepName: string; prompt: string; description: string }>;
    score: TAccumulatedResults extends Record<'generateScoreStepResult', infer TScore> ? TScore : never;
    reason?: TAccumulatedResults extends Record<'generateReasonStepResult', infer TReason> ? TReason : undefined;
  } {
    // Runtime check: execute only allowed after generateScore
    if (!this.hasGenerateScore) {
      throw new Error(
        `Pipeline "${this.metadata.name}": Cannot execute pipeline without generateScore() step. ` +
          `Current steps: [${this.steps.map(s => s.name).join(', ')}]`,
      );
    }

    let accumulatedResults: Record<string, any> = {};
    let lastStepResult: any = null;
    const generatedPrompts: Array<{ stepName: string; prompt: string; description: string }> = [];

    console.log(`🚀 Starting pipeline "${this.metadata.name}" [${input.runId || 'no-id'}]`);

    for (const step of this.steps) {
      const startTime = performance.now();

      try {
        // Create context based on step type
        const context =
          step.name === 'generateReason'
            ? {
                run: input,
                results: accumulatedResults,
                score: accumulatedResults.generateScoreStepResult,
              }
            : {
                run: input,
                results: accumulatedResults,
              };

        let stepResult: any;

        if (step.isPromptObject) {
          const originalStep = this.originalPromptObjects.get(step.name);
          if (originalStep) {
            const prompt = originalStep.createPrompt(context);

            generatedPrompts.push({
              stepName: step.name,
              prompt: prompt,
              description: originalStep.description,
            });

            if (options.logPrompts) {
              console.log(`📝 Prompt for "${step.name}":\n${prompt}`);
            }

            if (options.llmCall) {
              stepResult = options.llmCall(prompt, originalStep.outputSchema);
            } else {
              stepResult = this.generateMockResponse(originalStep.outputSchema, step.name);
            }

            stepResult = originalStep.outputSchema.parse(stepResult);
          }
        } else {
          stepResult = step.execute(context);
        }

        const duration = performance.now() - startTime;
        const resultKey = `${step.name}StepResult`;
        accumulatedResults[resultKey] = stepResult;
        lastStepResult = stepResult;

        console.log(`✅ ${step.name} (${duration.toFixed(1)}ms)`);
      } catch (error) {
        console.error(`❌ Step "${step.name}" failed:`, error);
        throw new Error(`Pipeline execution failed at step: ${step.name}`);
      }
    }

    console.log(`🏁 Pipeline "${this.metadata.name}" completed`);

    return {
      input: input,
      results: accumulatedResults as TAccumulatedResults,
      finalResult: lastStepResult,
      generatedPrompts: generatedPrompts,
      score: accumulatedResults.generateScoreStepResult,
      reason: accumulatedResults.generateReasonStepResult,
    };
  }

  private isPromptObject(stepDef: any): boolean {
    return (
      typeof stepDef === 'object' && 'description' in stepDef && 'outputSchema' in stepDef && 'createPrompt' in stepDef
    );
  }

  private createPromptExecutor<T>(promptObj: PromptObject<T, any, any>) {
    return (context: any): T => {
      return this.generateMockResponse(promptObj.outputSchema, 'mock');
    };
  }

  private generateMockResponse(schema: z.ZodSchema<any>, stepName: string): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema._def.shape();
      const mockObj: any = {};

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const field = fieldSchema as z.ZodTypeAny;

        if (field instanceof z.ZodString) {
          mockObj[key] = `Mock ${key}`;
        } else if (field instanceof z.ZodNumber) {
          mockObj[key] = Math.floor(Math.random() * 100);
        } else if (field instanceof z.ZodBoolean) {
          mockObj[key] = Math.random() > 0.5;
        } else if (field instanceof z.ZodArray) {
          mockObj[key] = [`Item 1`, `Item 2`];
        } else if (field instanceof z.ZodEnum) {
          const values = (field as any)._def.values;
          mockObj[key] = values[Math.floor(Math.random() * values.length)];
        } else {
          mockObj[key] = `Mock ${key}`;
        }
      }

      return mockObj;
    }

    return `Mock response for ${stepName}`;
  }

  getSteps(): Array<{ name: string; type: 'function' | 'prompt'; description?: string }> {
    return this.steps.map(step => ({
      name: step.name,
      type: step.isPromptObject ? 'prompt' : 'function',
      description: step.description,
    }));
  }

  // Get complete pipeline metadata including steps
  getMetadata(): {
    name: string;
    description: string;
    steps: Array<{ name: string; type: 'function' | 'prompt'; description?: string }>;
    stepCount: number;
    hasGenerateScore: boolean;
  } {
    return {
      name: this.metadata.name,
      description: this.metadata.description,
      steps: this.getSteps(),
      stepCount: this.steps.length,
      hasGenerateScore: this.hasGenerateScore,
    };
  }
}

export function createNewScorer({ name, description, judge }: ScorerConfig): MastraNewScorer<{}> {
  return new MastraNewScorer<{}>({ name, description, judge });
}
