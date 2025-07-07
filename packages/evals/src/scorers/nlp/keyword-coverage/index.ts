import { CodeScorer } from '@mastra/core/eval';
import type { CodeScorerScoreResult } from '@mastra/core/eval';
import keyword_extractor from 'keyword-extractor';

interface KeywordCoverageResult extends CodeScorerScoreResult {
  info: {
    totalKeywords: number;
    matchedKeywords: number;
  };
}

export class KeywordCoverageScorer extends CodeScorer {
  name = 'Keyword Coverage Scorer';
  description = 'A scorer that evaluates the keyword coverage between an output and an input';

  async score({ input, output }: { input: string; output: string }): Promise<KeywordCoverageResult> {
    // Handle empty strings case
    if (!input && !output) {
      return {
        score: 1,
        input,
        output,
        info: {
          totalKeywords: 0,
          matchedKeywords: 0,
        },
      };
    }

    const extractKeywords = (text: string) => {
      return keyword_extractor.extract(text, {
        language: 'english',
        remove_digits: true,
        return_changed_case: true,
        remove_duplicates: true,
      });
    };

    const referenceKeywords = new Set(extractKeywords(input));
    const responseKeywords = new Set(extractKeywords(output));

    const matchedKeywords = [...referenceKeywords].filter(k => responseKeywords.has(k));
    const totalKeywords = referenceKeywords.size;
    const coverage = totalKeywords > 0 ? matchedKeywords.length / totalKeywords : 0;

    return {
      score: coverage,
      input,
      output,
      info: {
        totalKeywords: referenceKeywords.size,
        matchedKeywords: matchedKeywords.length,
      },
    };
  }
}
