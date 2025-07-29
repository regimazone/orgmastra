import { createScorer } from './create-scorer';

// Function-based scorer builders
export const ScorerBuilders = {
  basic: createScorer({
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
  }),

  withPreprocess: createScorer({
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
  }),

  withReason: createScorer({
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
    generateReason: async run =>
      `the reason is because the input is ${run.analyzeStepResult?.input} and the output is ${run.analyzeStepResult?.output}`,
  }),

  allSteps: createScorer({
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
    generateReason: async run =>
      `the reason the score is 1 is because the input is ${run.analyzeStepResult?.inputFromAnalyze} and the output is ${run.analyzeStepResult?.outputFromAnalyze}`,
  }),
};
