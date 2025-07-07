import { CodeScorer } from '@mastra/core/eval';
import type { CodeScorerScoreResult } from '@mastra/core/eval';
import { SequenceMatcher } from 'difflib';

interface TextualDifferenceScorerResult extends CodeScorerScoreResult {
  info: {
    ratio: number;
    changes: number;
    lengthDiff: number;
    confidence: number;
  };
}

export class TextualDifferenceScorer extends CodeScorer {
  name = 'Textual Difference Scorer';
  description = 'A scorer that evaluates the textual difference between an output and an input';

  async score({ input, output }: { input: string; output: string }): Promise<TextualDifferenceScorerResult> {
    const matcher = new SequenceMatcher(null, input, output);
    const ratio = matcher.ratio();

    // Get detailed operations
    const ops = matcher.getOpcodes();
    const changes = ops.filter(([op]) => op !== 'equal').length;

    // Calculate confidence based on text length difference
    const maxLength = Math.max(input.length, output.length);
    const lengthDiff = maxLength > 0 ? Math.abs(input.length - output.length) / maxLength : 0;
    const confidence = 1 - lengthDiff;

    return {
      score: ratio,
      input,
      output,
      info: {
        confidence,
        ratio,
        changes,
        lengthDiff,
      },
    };
  }
}
