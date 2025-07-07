import { CodeScorer } from '@mastra/core/eval';
import type { CodeScorerScoreResult } from '@mastra/core/eval';
import Sentiment from 'sentiment';

interface ToneConsistencyResult extends CodeScorerScoreResult {
  info:
    | {
        responseSentiment: number;
        referenceSentiment: number;
        difference: number;
      }
    | {
        avgSentiment: number;
        sentimentVariance: number;
      };
}

export class ToneConsistencyScorer extends CodeScorer {
  private sentiment = new Sentiment();

  name = 'Tone Consistency Scorer';
  description = 'A scorer that evaluates the consistency of an LLM output to an input';

  async score({ input, output }: { input: string; output: string }): Promise<ToneConsistencyResult> {
    const responseSentiment = this.sentiment.analyze(input);

    if (output) {
      // Compare sentiment with reference
      const referenceSentiment = this.sentiment.analyze(output);
      const sentimentDiff = Math.abs(responseSentiment.comparative - referenceSentiment.comparative);
      const normalizedScore = Math.max(0, 1 - sentimentDiff);

      return {
        score: normalizedScore,
        input,
        output,
        info: {
          responseSentiment: responseSentiment.comparative,
          referenceSentiment: referenceSentiment.comparative,
          difference: sentimentDiff,
        },
      };
    }

    // Evaluate sentiment stability across response
    const sentences = input.match(/[^.!?]+[.!?]+/g) || [input];
    const sentiments = sentences.map(s => this.sentiment.analyze(s).comparative);
    const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - avgSentiment, 2), 0) / sentiments.length;
    const stability = Math.max(0, 1 - variance);

    return {
      score: stability,
      input,
      output,
      info: {
        avgSentiment,
        sentimentVariance: variance,
      },
    };
  }
}
