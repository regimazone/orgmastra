import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScorer } from './create-scorer';

describe('createScorer', () => {
  it('should create a scorer with minimum steps required (analyze and generateScore) as functions', async () => {
    const inputText = 'test input';
    const outputText = 'test output';
    const userInput = [{ role: 'user', content: inputText }];
    const agentOutput = { role: 'assistant', text: outputText };

    const scorer = createScorer({
      name: 'test-scorer',
      description: 'A test scorer',
      analyze: async run => {
        return {
          input: run.input?.[0]?.content,
          output: run.output.text,
        };
      },
      generateScore: async run => {
        const inputLength = run.analyzeStepResult?.input.length;
        const outputLength = run.analyzeStepResult?.output.length;

        if (inputLength === undefined || outputLength === undefined) {
          return 0;
        }

        return 1;
      },
    });

    const result = await scorer.run({
      input: userInput,
      output: agentOutput,
    });

    expect(result.score).toBe(1);
    expect(result.analyzeStepResult).toEqual({
      input: inputText,
      output: outputText,
    });
  });

  it('should create a scorer with preprocess step', async () => {
    const inputText = 'test input';
    const outputText = 'test output';
    const userInput = [{ role: 'user', content: inputText }];
    const agentOutput = { role: 'assistant', text: outputText };

    const scorer = createScorer({
      name: 'test-scorer',
      description: 'A test scorer',
      preprocess: async run => {
        return {
          reformattedInput: run.input?.[0]?.content.toUpperCase(),
          reformattedOutput: run.output.text.toUpperCase(),
        };
      },
      analyze: async run => {
        console.log('run in analyze', JSON.stringify(run, null, 2));
        return {
          inputFromAnalyze: run.preprocessStepResult?.reformattedInput + `!`,
          outputFromAnalyze: run.preprocessStepResult?.reformattedOutput + `!`,
        };
      },
      generateScore: async run => {
        console.log('run in generateScore', JSON.stringify(run, null, 2));
        const analyzeInput = run.analyzeStepResult?.inputFromAnalyze.length;
        const analyzeOutput = run.analyzeStepResult?.outputFromAnalyze.length;
        const preprocessInput = run.preprocessStepResult?.reformattedInput.length;
        const preprocessOutput = run.preprocessStepResult?.reformattedOutput.length;

        if (
          analyzeInput === undefined ||
          analyzeOutput === undefined ||
          preprocessInput === undefined ||
          preprocessOutput === undefined
        ) {
          return 0;
        }

        return 1;
      },
    });

    const result = await scorer.run({
      input: userInput,
      output: agentOutput,
    });

    expect(result.score).toBe(1);
    expect(result.preprocessStepResult).toEqual({
      reformattedInput: inputText.toUpperCase(),
      reformattedOutput: outputText.toUpperCase(),
    });
    expect(result.analyzeStepResult).toEqual({
      inputFromAnalyze: inputText.toUpperCase() + `!`,
      outputFromAnalyze: outputText.toUpperCase() + `!`,
    });
  });

  it('should create a scorer with reason step', async () => {
    const inputText = 'test input';
    const outputText = 'test output';
    const userInput = [{ role: 'user', content: inputText }];
    const agentOutput = { role: 'assistant', text: outputText };

    const scorer = createScorer({
      name: 'test-scorer',
      description: 'A test scorer',
      analyze: async run => {
        return { input: run.input?.[0]?.content, output: run.output.text };
      },
      generateScore: async run => {
        return 1;
      },
      generateReason: async run => {
        return `the reason is because the input is ${run.analyzeStepResult?.input} and the output is ${run.analyzeStepResult?.output}`;
      },
    });

    const result = await scorer.run({
      input: userInput,
      output: agentOutput,
    });

    expect(result.reason).toBe(`the reason is because the input is ${inputText} and the output is ${outputText}`);
  });
});
