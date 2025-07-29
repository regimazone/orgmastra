import { describe, it, expect, beforeEach } from 'vitest';
import {
  FunctionBasedScorerBuilders,
  MixedScorerBuilders,
  PromptBasedScorerBuilders,
} from './create-scorer.test-utils';

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
    it('should create a scorer with minimum steps required (analyze and generateScore) as functions', async () => {
      const scorer = FunctionBasedScorerBuilders.basic;
      const result = await scorer.run(testData.scoringInput);

      expect(result.score).toBe(1);
      expect(result.analyzeStepResult).toEqual({
        input: testData.inputText,
        output: testData.outputText,
      });
    });

    it('should create a scorer with preprocess step', async () => {
      const scorer = FunctionBasedScorerBuilders.withPreprocess;
      const result = await scorer.run(testData.scoringInput);

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
      const scorer = FunctionBasedScorerBuilders.withReason;
      const result = await scorer.run(testData.scoringInput);

      expect(result.reason).toBe(
        `the reason is because the input is ${testData.inputText} and the output is ${testData.outputText}`,
      );
    });

    it('should create a scorer with all steps', async () => {
      const scorer = FunctionBasedScorerBuilders.allSteps;
      const result = await scorer.run(testData.scoringInput);

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

  describe('Steps as prompt objects scorer', () => {
    // TODO: Test with generateScore as Prompt object
    it('should create a scorer with minimum steps required', async () => {
      const scorer = PromptBasedScorerBuilders.basic;
      const result = await scorer.run(testData.scoringInput);

      expect(result.score).toBe(1);
      expect(result.analyzeStepResult).toEqual({
        inputLength: testData.inputText.length,
        outputLength: testData.outputText.length,
      });
      expect(result.analyzePrompt).toContain('Test Analyze prompt');
    });

    it('should create a scorer with preprocess step', async () => {
      const scorer = PromptBasedScorerBuilders.withPreprocess;
      const result = await scorer.run(testData.scoringInput);

      expect(result.score).toBe(1);
      expect(result.preprocessStepResult).toEqual({
        reformattedInput: testData.inputText.toUpperCase(),
        reformattedOutput: testData.outputText.toUpperCase(),
      });
      expect(result.preprocessPrompt).toContain('Test Preprocess prompt');
      expect(result.analyzeStepResult).toEqual({
        inputLength: testData.inputText.length,
        outputLength: testData.outputText.length,
      });
      expect(result.analyzePrompt).toContain('Test Analyze prompt');
    });

    it('should create a scorer with reason step', async () => {
      const scorer = PromptBasedScorerBuilders.withReason;
      const result = await scorer.run(testData.scoringInput);

      expect(result.score).toBe(1);
      expect(result.reason).toBe('TEST REASON');
      expect(result.reasonPrompt).toContain('Test Generate Reason prompt');
    });

    it('should create a scorer with all steps', async () => {
      const scorer = PromptBasedScorerBuilders.withAllSteps;
      const result = await scorer.run(testData.scoringInput);

      expect(result).toEqual(
        expect.objectContaining({
          preprocessStepResult: {
            reformattedInput: 'TEST INPUT',
            reformattedOutput: 'TEST OUTPUT',
          },
          analyzeStepResult: {
            inputLength: 10,
            outputLength: 11,
          },
          analyzePrompt: 'Test Analyze prompt',
          preprocessPrompt: 'Test Preprocess prompt',
          score: 1,
          reason: 'TEST REASON',
          reasonPrompt: 'Test Generate Reason prompt',
        }),
      );
    });
  });

  describe('scorers with both function and prompt objects steps', () => {
    it('should create a scorer with preprocess function and analyze prompt object', async () => {
      const scorer = MixedScorerBuilders.withPreprocessFunctionAnalzyePrompt;
      const result = await scorer.run(testData.scoringInput);

      console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(
        expect.objectContaining({
          preprocessStepResult: {
            reformattedInput: 'TEST INPUT from preprocess function!',
            reformattedOutput: 'TEST OUTPUT from preprocess function!',
          },
          analyzeStepResult: {
            inputLength: 10,
            outputLength: 11,
          },
          analyzePrompt: 'Test Analyze prompt',
          score: 1,
        }),
      );
    });

    it('should create a scorer with preprocess prompt and analyze function', async () => {
      const scorer = MixedScorerBuilders.withPreprocessPromptAnalyzeFunction;
      const result = await scorer.run(testData.scoringInput);

      console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(
        expect.objectContaining({
          preprocessStepResult: {
            reformattedInput: 'TEST INPUT from preprocess prompt!',
            reformattedOutput: 'TEST OUTPUT from preprocess prompt!',
          },
          analyzeStepResult: {
            inputFromAnalyze: 'TEST INPUT from preprocess prompt!!',
            outputFromAnalyze: 'TEST OUTPUT from preprocess prompt!!',
          },
          preprocessPrompt: 'Test Preprocess prompt',
          score: 1,
        }),
      );
    });

    it('should create a scorer with reason function and analyze prompt object', async () => {
      const scorer = MixedScorerBuilders.withReasonFunctionAnalyzePrompt;
      const result = await scorer.run(testData.scoringInput);

      console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(
        expect.objectContaining({
          analyzeStepResult: {
            inputLength: 10,
            outputLength: 11,
          },
          analyzePrompt: 'Test Analyze prompt',
          score: 1,
          reason: 'the reason is because the input is 10 and the output is 11 from generateReason function',
        }),
      );
    });

    it('should create a scorer with reason prompt and analyze function', async () => {
      const scorer = MixedScorerBuilders.withReasonPromptAnalyzeFunction;
      const result = await scorer.run(testData.scoringInput);

      console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(
        expect.objectContaining({
          analyzeStepResult: {
            inputFromAnalyze: 'test input from analyze function!',
            outputFromAnalyze: 'test output from analyze function!',
          },
          score: 1,
          reason: 'TEST REASON',
          reasonPrompt: 'Test Generate Reason prompt',
        }),
      );
    });
  });
});
