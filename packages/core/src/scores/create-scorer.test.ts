import { describe, it, expect, beforeEach } from 'vitest';
import { ScorerBuilders } from './create-scorer.test-utils';

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

  it('should create a scorer with minimum steps required (analyze and generateScore) as functions', async () => {
    const scorer = ScorerBuilders.basic;
    const result = await scorer.run(testData.scoringInput);

    expect(result.score).toBe(1);
    expect(result.analyzeStepResult).toEqual({
      input: testData.inputText,
      output: testData.outputText,
    });
  });

  it('should create a scorer with preprocess step', async () => {
    const scorer = ScorerBuilders.withPreprocess;
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
    const scorer = ScorerBuilders.withReason;
    const result = await scorer.run(testData.scoringInput);

    expect(result.reason).toBe(
      `the reason is because the input is ${testData.inputText} and the output is ${testData.outputText}`,
    );
  });

  it('should create a scorer with all steps', async () => {
    const scorer = ScorerBuilders.allSteps;
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
