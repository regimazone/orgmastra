import { CodeScorer } from '@mastra/core/eval';
import type { CodeScorerScoreResult } from '@mastra/core/eval';
import stringSimilarity from 'string-similarity';

interface ContentSimilarityResult extends CodeScorerScoreResult {
  info: {
    similarity: number;
  };
}

interface ContentSimilarityOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
}

export class ContentSimilarityScorer extends CodeScorer {
  private options: ContentSimilarityOptions;

  name = 'Content Similarity Scorer';
  description = 'A scorer that evaluates the similarity between an output and an input';

  constructor(options: ContentSimilarityOptions = {}) {
    super();
    this.options = {
      ignoreCase: true,
      ignoreWhitespace: true,
      ...options,
    };
  }

  async score({ input, output }: { input: string; output: string }): Promise<ContentSimilarityResult> {
    let processedInput = input;
    let processedOutput = output;

    if (this.options.ignoreCase) {
      processedInput = processedInput.toLowerCase();
      processedOutput = processedOutput.toLowerCase();
    }

    if (this.options.ignoreWhitespace) {
      processedInput = processedInput.replace(/\s+/g, ' ').trim();
      processedOutput = processedOutput.replace(/\s+/g, ' ').trim();
    }

    const similarity = stringSimilarity.compareTwoStrings(processedInput, processedOutput);

    return {
      score: similarity,
      input,
      output,
      info: { similarity },
    };
  }
}
