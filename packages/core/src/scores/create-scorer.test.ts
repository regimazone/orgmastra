import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScorer } from './create-scorer';
import { z } from 'zod';

// Test data factory
const createTestData = () => ({
  inputText: 'test input',
  outputText: 'test output',
  get userInput() {
    return [{ role: 'user', content: this.inputText }];
  },
  get agentOutput() {
    return { role: 'assistant', text: this.outputText };
  },
  get scoringInput() {
    return { input: this.userInput, output: this.agentOutput };
  },
});

// Scorer builders for different scenarios
const createBasicScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'test-scorer',
    description: 'A test scorer',
    analyze: async run => ({
      input: run.input?.[0]?.content,
      output: run.output.text,
    }),
    generateScore: async run => {
      const inputLength = run.analyzeStepResult?.input.length;
      const outputLength = run.analyzeStepResult?.output.length;
      return inputLength !== undefined && outputLength !== undefined ? 1 : 0;
    },
  });

const createPreprocessScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'test-scorer',
    description: 'A test scorer',
    preprocess: async run => ({
      reformattedInput: run.input?.[0]?.content.toUpperCase(),
      reformattedOutput: run.output.text.toUpperCase(),
    }),
    analyze: async run => ({
      inputFromAnalyze: run.preprocessStepResult?.reformattedInput + `!`,
      outputFromAnalyze: run.preprocessStepResult?.reformattedOutput + `!`,
    }),
    generateScore: async run => {
      const { analyzeStepResult, preprocessStepResult } = run;
      const lengths = [
        analyzeStepResult?.inputFromAnalyze.length,
        analyzeStepResult?.outputFromAnalyze.length,
        preprocessStepResult?.reformattedInput.length,
        preprocessStepResult?.reformattedOutput.length,
      ];
      return lengths.every(len => len !== undefined) ? 1 : 0;
    },
  });

const createReasonScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'test-scorer',
    description: 'A test scorer',
    analyze: async run => ({
      input: run.input?.[0]?.content,
      output: run.output.text,
    }),
    generateScore: async run => 1,
    generateReason: async run =>
      `the reason is because the input is ${run.analyzeStepResult?.input} and the output is ${run.analyzeStepResult?.output}`,
  });

const createAllStepsScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'test-scorer',
    description: 'A test scorer',
    preprocess: async run => ({
      reformattedInput: run.input?.[0]?.content.toUpperCase(),
      reformattedOutput: run.output.text.toUpperCase(),
    }),
    analyze: async run => ({
      inputFromAnalyze: run.preprocessStepResult?.reformattedInput + `!`,
      outputFromAnalyze: run.preprocessStepResult?.reformattedOutput + `!`,
    }),
    generateScore: async run => 1,
    generateReason: async run =>
      `the reason the score is 1 is because the input is ${run.analyzeStepResult?.inputFromAnalyze} and the output is ${run.analyzeStepResult?.outputFromAnalyze}`,
  });

// LLM-based scorer builders (using objects instead of functions)
const createLLMBasicScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'llm-test-scorer',
    description: 'An LLM-powered test scorer',
    judge: {
      // model: yourActualModel, // You'd use your actual model instance here
      instructions: 'You are a helpful scoring assistant',
    } as any, // Cast to any for test purposes
    analyze: {
      description: 'Extract input and output for analysis',
      outputSchema: z.object({
        input: z.string(),
        output: z.string(),
      }),
      createPrompt: ({ run }) => `
        Extract the input and output from this conversation:
        Input: ${JSON.stringify(run.input)}
        Output: ${JSON.stringify(run.output)}
        
        Return the extracted input content and output text.
      `,
    },
    generateScore: {
      description: 'Score based on length criteria',
      outputSchema: z.number().min(0).max(1),
      createPrompt: ({ run }) => `
        Analyze this data: ${JSON.stringify(run.analyzeStepResult)}
        
        Return a score between 0 and 1 based on whether both input and output have meaningful length.
        Return 1 if both have content, 0 otherwise.
      `,
    },
  });

const createLLMPreprocessScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'llm-preprocess-scorer',
    description: 'LLM scorer with preprocessing',
    judge: {
      // model: yourActualModel, // You'd use your actual model instance here
      instructions: 'You are a text processing and scoring assistant',
    } as any, // Cast to any for test purposes
    preprocess: {
      description: 'Reformat input and output to uppercase',
      outputSchema: z.object({
        reformattedInput: z.string(),
        reformattedOutput: z.string(),
      }),
      createPrompt: ({ run }) => `
        Take this input and output and reformat them to uppercase:
        Input: ${run.input?.[0]?.content}
        Output: ${run.output.text}
        
        Return reformattedInput and reformattedOutput in uppercase.
      `,
    },
    analyze: {
      description: 'Add exclamation marks to preprocessed data',
      outputSchema: z.object({
        inputFromAnalyze: z.string(),
        outputFromAnalyze: z.string(),
      }),
      createPrompt: ({ run }) => `
        Take the preprocessed data and add exclamation marks:
        Preprocessed: ${JSON.stringify(run.preprocessStepResult)}
        
        Return inputFromAnalyze and outputFromAnalyze with "!" added to each.
      `,
    },
    generateScore: {
      description: 'Score based on successful processing',
      outputSchema: z.number(),
      createPrompt: ({ run }) => `
        Check if all processing steps completed successfully:
        Preprocessed: ${JSON.stringify(run.preprocessStepResult)}
        Analyzed: ${JSON.stringify(run.analyzeStepResult)}
        
        Return 1 if all fields are present and non-empty, 0 otherwise.
      `,
    },
  });

const createMixedScorer = (testData: ReturnType<typeof createTestData>) =>
  createScorer({
    name: 'mixed-scorer',
    description: 'Mix of function and LLM steps',
    judge: {
      // model: yourActualModel, // You'd use your actual model instance here
      instructions: 'You are a scoring assistant',
    } as any, // Cast to any for test purposes
    // Function-based preprocess
    preprocess: async run => ({
      wordCount: run.output.text.split(' ').length,
      hasInput: !!run.input?.[0]?.content,
    }),
    // LLM-based analyze
    analyze: {
      description: 'Analyze the preprocessed metrics',
      outputSchema: z.object({
        quality: z.string(),
        score: z.number(),
      }),
      createPrompt: ({ run }) => `
        Based on these metrics: ${JSON.stringify(run.preprocessStepResult)}
        
        Determine the quality ('good', 'fair', 'poor') and assign a preliminary score (0-100).
      `,
    },
    // Function-based scoring
    generateScore: async run => {
      const prelimScore = run.analyzeStepResult?.score || 0;
      const wordCount = run.preprocessStepResult?.wordCount || 0;
      // Boost score if word count is good
      return Math.min(1, prelimScore / 100 + (wordCount > 5 ? 0.1 : 0));
    },
    // LLM-based reasoning
    generateReason: {
      description: 'Explain the final score',
      createPrompt: ({ run }) => `
        Explain this scoring decision:
        - Preprocessed metrics: ${JSON.stringify(run.preprocessStepResult)}
        - Analysis result: ${JSON.stringify(run.analyzeStepResult)}
        - Final score: ${run.score}
        
        Provide a clear explanation of why this score was given.
      `,
    },
  });

// Test execution helper
const runScorerTest = async (scorer: any, testData: ReturnType<typeof createTestData>) => {
  return await scorer.run(testData.scoringInput);
};

describe('createScorer', () => {
  let testData: ReturnType<typeof createTestData>;

  beforeEach(() => {
    testData = createTestData();
  });

  it('should create a scorer with minimum steps required (analyze and generateScore) as functions', async () => {
    const scorer = createBasicScorer(testData);
    const result = await runScorerTest(scorer, testData);

    expect(result.score).toBe(1);
    expect(result.analyzeStepResult).toEqual({
      input: testData.inputText,
      output: testData.outputText,
    });
  });

  it('should create a scorer with preprocess step', async () => {
    const scorer = createPreprocessScorer(testData);
    const result = await runScorerTest(scorer, testData);

    expect(result.score).toBe(1);
    expect(result.preprocessStepResult).toEqual({
      reformattedInput: testData.inputText.toUpperCase(),
      reformattedOutput: testData.outputText.toUpperCase(),
    });
    expect(result.analyzeStepResult).toEqual({
      inputFromAnalyze: testData.inputText.toUpperCase() + `!`,
      outputFromAnalyze: testData.outputText.toUpperCase() + `!`,
    });
  });

  it('should create a scorer with reason step', async () => {
    const scorer = createReasonScorer(testData);
    const result = await runScorerTest(scorer, testData);

    expect(result.reason).toBe(
      `the reason is because the input is ${testData.inputText} and the output is ${testData.outputText}`,
    );
  });

  it('should create a scorer with all steps', async () => {
    const scorer = createAllStepsScorer(testData);
    const result = await runScorerTest(scorer, testData);

    expect(result.score).toBe(1);
    expect(result.preprocessStepResult).toEqual({
      reformattedInput: testData.inputText.toUpperCase(),
      reformattedOutput: testData.outputText.toUpperCase(),
    });
    expect(result.analyzeStepResult).toEqual({
      inputFromAnalyze: testData.inputText.toUpperCase() + `!`,
      outputFromAnalyze: testData.outputText.toUpperCase() + `!`,
    });
    expect(result.reason).toBe(
      `the reason the score is 1 is because the input is ${testData.inputText.toUpperCase()}! and the output is ${testData.outputText.toUpperCase()}!`,
    );
  });
});
