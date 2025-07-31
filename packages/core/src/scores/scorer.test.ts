import { FunctionBasedScorerBuilders } from './scorer.test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockLanguageModelV1 } from 'ai/test';
import { createNewScorer } from './scorer';
import z from 'zod';

export const PromptBasedScorerBuilders = {
  withAnalyze: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .analyze({
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                      "inputLength": 10,
                      "outputLength": 11
                  }`,
          }),
        }),
        instructions: `Test instructions`,
      },
      description: 'Analyze the input and output',
      outputSchema: z.object({
        inputLength: z.number(),
        outputLength: z.number(),
      }),
      createPrompt: () => {
        return `Test Analyze prompt`;
      },
    })
    .generateScore(({ results }) => {
      const inputLength = results.analyzeStepResult?.inputLength;
      const outputLength = results.analyzeStepResult?.outputLength;
      return inputLength !== undefined && outputLength !== undefined ? 1 : 0;
    }),

  withPreprocessAndAnalyze: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .preprocess({
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                            "reformattedInput": "TEST INPUT",
                            "reformattedOutput": "TEST OUTPUT"
                        }`,
          }),
        }),
        instructions: `Test instructions`,
      },
      description: 'Preprocess the input and output',
      outputSchema: z.object({
        reformattedInput: z.string(),
        reformattedOutput: z.string(),
      }),
      createPrompt: () => {
        return `Test Preprocess prompt`;
      },
    })
    .analyze({
      description: 'Analyze the input and output',
      outputSchema: z.object({
        inputLength: z.number(),
        outputLength: z.number(),
      }),
      createPrompt: () => {
        return `Test Analyze prompt`;
      },
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                        "inputLength": 10,
                        "outputLength": 11
                    }`,
          }),
        }),
        instructions: `Test instructions`,
      },
    })
    .generateScore(({ results }) => {
      const inputLength = results.analyzeStepResult?.inputLength;
      const outputLength = results.analyzeStepResult?.outputLength;
      return inputLength !== undefined && outputLength !== undefined ? 1 : 0;
    }),

  withAnalyzeAndReason: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .analyze({
      description: 'Analyze the input and output',
      outputSchema: z.object({
        inputLength: z.number(),
        outputLength: z.number(),
      }),
      createPrompt: () => {
        return `Test Analyze prompt`;
      },
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                        "inputLength": 10,
                        "outputLength": 11
                    }`,
          }),
        }),
        instructions: `Test instructions`,
      },
    })
    .generateScore(({ results }) => {
      const inputLength = results.analyzeStepResult?.inputLength;
      const outputLength = results.analyzeStepResult?.outputLength;
      return inputLength !== undefined && outputLength !== undefined ? 1 : 0;
    })
    .generateReason({
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `This is a test reason`,
          }),
        }),
        instructions: `Test instructions`,
      },
      description: 'Generate a reason for the score',
      createPrompt: () => {
        return `Test Generate Reason prompt`;
      },
    }),

  withAllSteps: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .preprocess({
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                            "reformattedInput": "TEST INPUT",
                            "reformattedOutput": "TEST OUTPUT"
                        }`,
          }),
        }),
        instructions: `Test instructions`,
      },
      description: 'Preprocess the input and output',
      outputSchema: z.object({
        reformattedInput: z.string(),
        reformattedOutput: z.string(),
      }),
      createPrompt: () => {
        return `Test Preprocess prompt`;
      },
    })
    .analyze({
      description: 'Analyze the input and output',
      outputSchema: z.object({
        inputLength: z.number(),
        outputLength: z.number(),
      }),
      createPrompt: () => {
        return `Test Analyze prompt`;
      },
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                        "inputLength": 10,
                        "outputLength": 11
                    }`,
          }),
        }),
        instructions: `Test instructions`,
      },
    })
    .generateScore(({ results }) => {
      const inputLength = results.analyzeStepResult?.inputLength;
      const outputLength = results.analyzeStepResult?.outputLength;
      return inputLength !== undefined && outputLength !== undefined ? 1 : 0;
    })
    .generateReason({
      judge: {
        model: new MockLanguageModelV1({
          defaultObjectGenerationMode: 'json',
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: `{
                            "reason": "TEST REASON"
                        }`,
          }),
        }),
        instructions: `Test instructions`,
      },
      description: 'Generate a reason for the score',
      createPrompt: () => {
        return `Test Generate Reason prompt`;
      },
    }),
};

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

describe('createScorer', () => {
  let testData: ReturnType<typeof createTestData>;

  beforeEach(() => {
    testData = createTestData();
  });

  describe('Steps as functions scorer', () => {
    it('should create a basic scorer with functions', async () => {
      const scorer = FunctionBasedScorerBuilders.basic;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with reason', async () => {
      const scorer = FunctionBasedScorerBuilders.withReason;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with preprocess and reason', async () => {
      const scorer = FunctionBasedScorerBuilders.withPreprocessAndReason;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with preprocess and analyze', async () => {
      const scorer = FunctionBasedScorerBuilders.withPreprocessAndAnalyze;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with preprocess only', async () => {
      const scorer = FunctionBasedScorerBuilders.withPreprocess;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with preprocess, analyze, and reason', async () => {
      const scorer = FunctionBasedScorerBuilders.withPreprocessAndAnalyzeAndReason;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with analyze only', async () => {
      const scorer = FunctionBasedScorerBuilders.withAnalyze;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('should create a scorer with analyze and reason', async () => {
      const scorer = FunctionBasedScorerBuilders.withAnalyzeAndReason;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });
  });

  describe('Steps as prompt objects scorer', () => {
    it('with analyze prompt object', async () => {
      const scorer = PromptBasedScorerBuilders.withAnalyze;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('with preprocess and analyze prompt object', async () => {
      const scorer = PromptBasedScorerBuilders.withPreprocessAndAnalyze;

      const result = await scorer.run(testData.scoringInput);

      expect(result).toMatchSnapshot();
    });

    it('with analyze and reason prompt object', async () => {
      const scorer = PromptBasedScorerBuilders.withAnalyzeAndReason;
      const result = await scorer.run(testData.scoringInput);

      expect(typeof result.reason).toBe('string');
      expect(result).toMatchSnapshot();
    });
  });
});
