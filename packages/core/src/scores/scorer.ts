// ================================
// CORE TYPES
// ================================

import type { LanguageModel } from '../llm';
import { z } from 'zod';
import type { MastraLanguageModel } from '../memory';
import { Agent } from '../agent';

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
  input?: any; // TODO: Add type
  output: any; // TODO: Add type
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
  judge: {
    model: MastraLanguageModel;
    instructions: string;
  };

  createPrompt: (context: PromptObjectContext<TAccumulated, TStepName>) => string;
}

// Special prompt object type for generateScore that always returns a number
interface GenerateScorePromptObject<TAccumulated extends Record<string, any>> {
  description: string;
  judge?: {
    model: MastraLanguageModel;
    instructions: string;
  };
  createPrompt: (context: StepContext<TAccumulated, ScorerRun>) => string;
}

// Special prompt object type for generateReason that always returns a string
interface GenerateReasonPromptObject<TAccumulated extends Record<string, any>> {
  description: string;
  judge?: {
    model: MastraLanguageModel;
    instructions: string;
  };
  createPrompt: (context: GenerateReasonContext<TAccumulated>) => string;
}

// Conditional type for generateScore step definition
type GenerateScoreStepDef<TAccumulated extends Record<string, any>> =
  | ((context: StepContext<TAccumulated, ScorerRun>) => number)
  | GenerateScorePromptObject<TAccumulated>;

// Conditional type for generateReason step definition
type GenerateReasonStepDef<TAccumulated extends Record<string, any>> =
  | ((context: GenerateReasonContext<TAccumulated>) => any)
  | GenerateReasonPromptObject<TAccumulated>;

class MastraNewScorer<TAccumulatedResults extends Record<string, any> = {}> {
  constructor(
    private metadata: ScorerConfig,
    private steps: Array<{
      name: string;
      execute: (context: any) => any;
      isPromptObject: boolean;
      description?: string;
      judge?: {
        model: MastraLanguageModel;
        instructions: string;
      };
    }> = [],
    private originalPromptObjects: Map<
      string,
      PromptObject<any, any, any> | GenerateReasonPromptObject<any> | GenerateScorePromptObject<any>
    > = new Map(),
  ) {}

  // Getter for pipeline name
  get name(): string {
    return this.metadata.name;
  }

  // Getter for pipeline description
  get description(): string {
    return this.metadata.description;
  }

  get judge() {
    return this.metadata.judge;
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

  generateScore<TScoreOutput extends number = number>(
    stepDef: GenerateScoreStepDef<TAccumulatedResults>,
  ): MastraNewScorer<AccumulatedResults<TAccumulatedResults, 'generateScore', TScoreOutput>> {
    const isPromptObj = this.isPromptObject(stepDef);

    if (isPromptObj) {
      const promptObj = stepDef as GenerateScorePromptObject<TAccumulatedResults>;
      this.originalPromptObjects.set('generateScore', promptObj);
    }

    const executeFunction = isPromptObj
      ? this.createGenerateScoreExecutor(stepDef as GenerateScorePromptObject<TAccumulatedResults>)
      : (stepDef as (context: StepContext<any, ScorerRun>) => TScoreOutput);

    return new MastraNewScorer(
      this.metadata,
      [
        ...this.steps,
        {
          name: 'generateScore',
          execute: executeFunction,
          isPromptObject: isPromptObj,
          description: isPromptObj
            ? (stepDef as GenerateScorePromptObject<TAccumulatedResults>).description
            : undefined,
        },
      ],
      new Map(this.originalPromptObjects),
    );
  }

  generateReason<TReasonOutput = string>(
    stepDef: GenerateReasonStepDef<TAccumulatedResults>,
  ): MastraNewScorer<AccumulatedResults<TAccumulatedResults, 'generateReason', TReasonOutput>> {
    // Runtime check: generateReason only allowed after generateScore
    if (!this.hasGenerateScore) {
      throw new Error(`Pipeline "${this.metadata.name}": generateReason() can only be called after generateScore()`);
    }

    const isPromptObj = this.isPromptObject(stepDef);

    if (isPromptObj) {
      const promptObj = stepDef as GenerateReasonPromptObject<TAccumulatedResults>;
      this.originalPromptObjects.set('generateReason', promptObj);
    }

    const executeFunction = isPromptObj
      ? this.createGenerateReasonExecutor(stepDef as GenerateReasonPromptObject<TAccumulatedResults>)
      : (stepDef as (context: GenerateReasonContext<any>) => TReasonOutput);

    return new MastraNewScorer(
      this.metadata,
      [
        ...this.steps,
        {
          name: 'generateReason',
          execute: executeFunction,
          isPromptObject: isPromptObj,
          description: isPromptObj
            ? (stepDef as GenerateReasonPromptObject<TAccumulatedResults>).description
            : undefined,
        },
      ],
      new Map(this.originalPromptObjects),
    );
  }

  async run(
    input: ScorerRun,
    options: {
      llmCall?: (prompt: string, schema: z.ZodSchema<any>) => any;
      logPrompts?: boolean;
    } = {},
  ): Promise<{
    run: ScorerRun;
    score: TAccumulatedResults extends Record<'generateScoreStepResult', infer TScore> ? TScore : never;
    reason?: TAccumulatedResults extends Record<'generateReasonStepResult', infer TReason> ? TReason : undefined;

    // Prompts
    preprocessPrompt?: string;
    analyzePrompt?: string;
    generateScorePrompt?: string;
    generateReasonPrompt?: string;

    // Results
    preprocessResult?: TAccumulatedResults extends Record<'preprocessStepResult', infer TPreprocess>
      ? TPreprocess
      : undefined;
    analyzeResult?: TAccumulatedResults extends Record<'analyzeStepResult', infer TAnalyze> ? TAnalyze : undefined;
  }> {
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
        let context: any;
        if (step.name === 'generateReason') {
          const score = accumulatedResults.generateScoreStepResult;
          if (score === undefined) {
            throw new Error(
              `Pipeline "${this.metadata.name}": generateReason step requires a score from generateScore step`,
            );
          }
          context = {
            run: input,
            results: accumulatedResults,
            score: score,
          };
        } else {
          context = {
            run: input,
            results: accumulatedResults,
          };
        }

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

            if (step.name === 'generateScore') {
              // Handle generateScore prompt objects (predefined schema)
              const generateScoreStep = originalStep as GenerateScorePromptObject<any>;
              const model = generateScoreStep.judge?.model ?? this.metadata.judge?.model;
              const instructions = generateScoreStep.judge?.instructions ?? this.metadata.judge?.instructions;

              if (model && instructions) {
                const judge = new Agent({
                  name: 'judge',
                  model,
                  instructions,
                });

                const result = await judge.generate(prompt, {
                  output: z.object({ score: z.number() }),
                });

                stepResult = result.object.score;
              } else {
                console.log(`MOCKINGGG SCORE`);
                stepResult = 0.75; // Mock score
              }
            } else if (step.name === 'generateReason') {
              // Handle generateReason prompt objects (no output schema)
              const generateReasonStep = originalStep as GenerateReasonPromptObject<any>;
              const model = generateReasonStep.judge?.model ?? this.metadata.judge?.model;
              const instructions = generateReasonStep.judge?.instructions ?? this.metadata.judge?.instructions;

              if (model && instructions) {
                const judge = new Agent({
                  name: 'judge',
                  model,
                  instructions,
                });

                const result = await judge.generate(prompt);
                stepResult = result.text;
              } else {
                stepResult = `Mock reason for ${generateReasonStep.description}`;
              }
            } else {
              // Handle other prompt objects (with output schema)
              const promptStep = originalStep as PromptObject<any, any, any>;
              const model = promptStep.judge?.model ?? this.metadata.judge?.model;
              const instructions = promptStep.judge?.instructions ?? this.metadata.judge?.instructions;

              if (model && instructions) {
                const judge = new Agent({
                  name: 'judge',
                  model,
                  instructions,
                });

                const result = await judge.generate(prompt, {
                  output: promptStep.outputSchema,
                });

                stepResult = promptStep.outputSchema.parse(result.object);
              } else {
                stepResult = this.generateMockResponse(promptStep.outputSchema, step.name);
              }
            }
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

    return {
      run: input,
      score: accumulatedResults.generateScoreStepResult,
      reason: accumulatedResults.generateReasonStepResult,

      // Prompts
      preprocessPrompt: generatedPrompts.find(p => p.stepName === 'preprocess')?.prompt,
      analyzePrompt: generatedPrompts.find(p => p.stepName === 'analyze')?.prompt,
      generateScorePrompt: generatedPrompts.find(p => p.stepName === 'generateScore')?.prompt,
      generateReasonPrompt: generatedPrompts.find(p => p.stepName === 'generateReason')?.prompt,

      // Results
      preprocessResult: accumulatedResults.preprocessStepResult,
      analyzeResult: accumulatedResults.analyzeStepResult,
    };
  }

  private isPromptObject(stepDef: any): boolean {
    // Check if it's a generateScore prompt object (has description and createPrompt, but no outputSchema)
    if (
      typeof stepDef === 'object' &&
      'description' in stepDef &&
      'createPrompt' in stepDef &&
      !('outputSchema' in stepDef)
    ) {
      return true;
    }

    // For other steps, check for description, outputSchema, and createPrompt
    const isOtherPromptObject =
      typeof stepDef === 'object' && 'description' in stepDef && 'outputSchema' in stepDef && 'createPrompt' in stepDef;

    return isOtherPromptObject;
  }

  private createPromptExecutor<T>(promptObj: PromptObject<T, any, any>) {
    return (context: any): T => {
      return this.generateMockResponse(promptObj.outputSchema, 'mock');
    };
  }

  private createGenerateScoreExecutor(promptObj: GenerateScorePromptObject<any>) {
    return (context: any): number => {
      return 0.75; // Mock score
    };
  }

  private createGenerateReasonExecutor(promptObj: GenerateReasonPromptObject<any>) {
    return (context: any): string => {
      return `Mock reason for ${promptObj.description}`;
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
