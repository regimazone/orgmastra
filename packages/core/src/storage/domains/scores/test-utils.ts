import { randomUUID } from 'crypto';
import { describe, it, expect } from 'vitest';
import type { ScoreRowData } from '../../../eval';
import type { MastraStorage } from '../../base';

export function createMockScore({ scorerId }: { scorerId: string }): ScoreRowData {
  return {
    id: randomUUID(),
    entityId: 'eval-agent',
    entityType: 'AGENT',
    scorerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    runId: 'run-123',
    reason: 'Sample reason',
    extractStepResult: {
      text: 'Sample extract step result',
    },
    analyzeStepResult: {
      text: 'Sample analyze step result',
    },
    score: 0.8,
    extractPrompt: 'Sample extract prompt',
    analyzePrompt: 'Sample analyze prompt',
    reasonPrompt: 'Sample reason prompt',
    scorer: {
      id: scorerId,
      name: 'my-eval',
      description: 'My eval',
    },
    input: [
      {
        id: randomUUID(),
        name: 'input-1',
        value: 'Sample input',
      },
    ],
    output: {
      text: 'Sample output',
    },
    source: 'LIVE',
    entity: {
      id: 'eval-agent',
      name: 'Sample entity',
    },
    runtimeContext: {},
  };
}

export function createScoresTest({ storage }: { storage: MastraStorage }) {
  describe('Score Operations', () => {
    it('should retrieve scores by scorer id', async () => {
      const scorerId = `scorer-${randomUUID()}`;

      // Create sample scores
      const score1 = createMockScore({ scorerId });
      const score2 = createMockScore({ scorerId });
      const score3 = createMockScore({ scorerId });

      // Insert evals

      await storage.saveScore(score1);
      await storage.saveScore(score2);
      await storage.saveScore(score3);

      // Test getting all evals for the agent
      const allScoresByScorerId = await storage.getScoresByScorerId({ scorerId, pagination: { page: 0, perPage: 10 } });
      expect(allScoresByScorerId?.scores).toHaveLength(3);
      expect(allScoresByScorerId?.scores.map(e => e.runId)).toEqual(
        expect.arrayContaining([score1.runId, score2.runId, score3.runId]),
      );

      // Test getting scores for non-existent scorer
      const nonExistentScores = await storage.getScoresByScorerId({
        scorerId: 'non-existent-scorer',
        pagination: { page: 0, perPage: 10 },
      });
      expect(nonExistentScores?.scores).toHaveLength(0);
    });
  });
}
