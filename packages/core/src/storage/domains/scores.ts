import type { EvalRow } from '../types';
import { MastraStorageBase } from './base';
import type { MastraStore } from './store';

export abstract class MastraScoresStorage extends MastraStorageBase {
  constructor({ store }: { store: MastraStore }) {
    super({ name: 'SCORES', store });
  }

  abstract getEvalsByAgentName(agentName: string, type?: 'test' | 'live'): Promise<EvalRow[]>;
}
