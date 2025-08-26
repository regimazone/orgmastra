import TTLCache from '@isaacs/ttlcache';
import { MastraServerCache } from './base';

export class InMemoryServerCache extends MastraServerCache {
  private cache: TTLCache<string, unknown> = new TTLCache({
    max: 1000,
    ttl: 1000 * 60 * 5,
  });

  async get(key: string): Promise<unknown> {
    return this.cache.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
