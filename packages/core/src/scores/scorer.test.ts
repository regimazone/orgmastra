import { createNewScorer } from './scorer';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Function-based scorer builders
export const FunctionBasedScorerBuilders = {
  basic: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  }).generateScore(({ run }) => {
    if (run.input?.[0]?.content.length > 0 && run.output.text.length > 0) {
      return 1;
    }
    return 0;
  }),

  withPreprocess: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .preprocess(({ run }) => {
      return {
        reformattedInput: run.input?.[0]?.content.toUpperCase(),
        reformattedOutput: run.output.text.toUpperCase(),
      };
    })
    .generateScore(({ results }) => {
      if (
        results.preprocessStepResult?.reformattedInput.length > 0 &&
        results.preprocessStepResult?.reformattedOutput.length > 0
      ) {
        return 1;
      }
      return 0;
    }),

  withPreprocessAndAnalyze: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .preprocess(({ run }) => {
      return {
        reformattedInput: run.input?.[0]?.content.toUpperCase(),
        reformattedOutput: run.output.text.toUpperCase(),
      };
    })
    .analyze(({ results }) => {
      return {
        inputFromAnalyze: results.preprocessStepResult?.reformattedInput + `!`,
        outputFromAnalyze: results.preprocessStepResult?.reformattedOutput + `!`,
      };
    })
    .generateScore(({ results }) => {
      if (
        results.analyzeStepResult?.inputFromAnalyze.length > 0 &&
        results.analyzeStepResult?.outputFromAnalyze.length > 0
      ) {
        return 1;
      }
      return 0;
    }),

  withPreprocessAndAnalyzeAndReason: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .preprocess(({ run }) => {
      return {
        reformattedInput: run.input?.[0]?.content.toUpperCase(),
        reformattedOutput: run.output.text.toUpperCase(),
      };
    })
    .analyze(({ results }) => {
      return {
        inputFromAnalyze: results.preprocessStepResult?.reformattedInput + `!`,
        outputFromAnalyze: results.preprocessStepResult?.reformattedOutput + `!`,
      };
    })
    .generateScore(({ results }) => {
      if (
        results.analyzeStepResult?.inputFromAnalyze.length > 0 &&
        results.analyzeStepResult?.outputFromAnalyze.length > 0
      ) {
        return 1;
      }
      return 0;
    })
    .generateReason(({ score, results }) => {
      return `the reason the score is ${score} is because the input is ${results.analyzeStepResult?.inputFromAnalyze} and the output is ${results.analyzeStepResult?.outputFromAnalyze}`;
    }),

  withPreprocessAndReason: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .preprocess(({ run }) => {
      return {
        reformattedInput: run.input?.[0]?.content.toUpperCase(),
        reformattedOutput: run.output.text.toUpperCase(),
      };
    })
    .generateScore(({ results }) => {
      if (
        results.preprocessStepResult?.reformattedInput.length > 0 &&
        results.preprocessStepResult?.reformattedOutput.length > 0
      ) {
        return 1;
      }
      return 0;
    })
    .generateReason(({ score, results }) => {
      return `the reason the score is ${score} is because the input is ${results.preprocessStepResult?.reformattedInput} and the output is ${results.preprocessStepResult?.reformattedOutput}`;
    }),

  withAnalyze: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .analyze(({ run }) => {
      return {
        inputFromAnalyze: run.input?.[0]?.content + `!`,
        outputFromAnalyze: run.output.text + `!`,
      };
    })
    .generateScore(({ results }) => {
      if (
        results.analyzeStepResult?.inputFromAnalyze.length > 0 &&
        results.analyzeStepResult?.outputFromAnalyze.length > 0
      ) {
        return 1;
      }
      return 0;
    }),

  withAnalyzeAndReason: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .analyze(({ run }) => {
      return {
        inputFromAnalyze: run.input?.[0]?.content + `!`,
        outputFromAnalyze: run.output.text + `!`,
      };
    })
    .generateScore(({ results }) => {
      if (
        results.analyzeStepResult?.inputFromAnalyze.length > 0 &&
        results.analyzeStepResult?.outputFromAnalyze.length > 0
      ) {
        return 1;
      }
      return 0;
    })
    .generateReason(({ score, results }) => {
      return `the reason the score is ${score} is because the input is ${results.analyzeStepResult?.inputFromAnalyze} and the output is ${results.analyzeStepResult?.outputFromAnalyze}`;
    }),

  withReason: createNewScorer({
    name: 'test-scorer',
    description: 'A test scorer',
  })
    .generateScore(({ run }) => {
      return run.input ? 1 : 0;
    })
    .generateReason(({ score, run }) => {
      return `the reason the score is ${score} is because the input is ${run.input?.[0]?.content} and the output is ${run.output.text}`;
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

      console.log(JSON.stringify(result, null, 2));
    });

    it('should create a scorer with reason', async () => {
      const scorer = FunctionBasedScorerBuilders.withReason;
      const result = await scorer.run(testData.scoringInput);

      console.log(JSON.stringify(result, null, 2));
    });
  });
});
