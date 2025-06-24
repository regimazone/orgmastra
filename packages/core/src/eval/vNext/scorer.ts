export interface ScorerResult {
  id: string;
  name: string;
  traceId: string;
  runId: string;
  evaluator: string;
  result: Record<string, any>;
  metadata: Record<string, any>;
  input: string;
  output: string;
  additionalContext: string;
  runtimeContext: Record<string, any>;
  /**
   * Things you can evaluate
   */
  entityType: 'AGENT' | 'WORKFLOW';
  entity: Record<string, any>;
  source: string;
  resourceId: string;
  threadId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ScorerInput = {
  input: string;
  output: string;
  entityId: string;
  entityType: 'AGENT' | 'WORKFLOW';
  entity: Record<string, any>;
  runId: string;
};

export abstract class Scorer {
  abstract evaluate({ input, output, entityId, entityType, entity, runId }: ScorerInput): Promise<ScorerResult>;
}
