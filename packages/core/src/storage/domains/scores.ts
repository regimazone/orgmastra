import type { EvalRow } from '../types';
import { MastraStorageBase } from './base';

export abstract class MastraScoresStorage extends MastraStorageBase {
  constructor() {
    super({ name: 'SCORES' });
  }

  abstract getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]>;
}
