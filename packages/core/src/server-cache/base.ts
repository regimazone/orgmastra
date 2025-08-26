import { MastraBase } from '../base';

export abstract class MastraServerCache extends MastraBase {
  constructor({ name }: { name: string }) {
    super({
      component: 'SERVER_CACHE',
      name,
    });
  }

  abstract get(key: string): Promise<unknown>;

  abstract set(key: string, value: unknown): Promise<void>;

  abstract delete(key: string): Promise<void>;

  abstract clear(): Promise<void>;
}
