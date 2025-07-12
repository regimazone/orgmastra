import { MastraBase } from '../../base';
import type { TABLE_NAMES } from '../constants';
import type { StorageColumn } from '../types';

export abstract class MastraStorageBase extends MastraBase {
  protected hasInitialized: null | Promise<boolean> = null;
  protected shouldCacheInit = true;

  constructor({ name }: { name: string }) {
    super({
      component: 'STORAGE',
      name,
    });
  }

  public get supports(): {
    selectByIncludeResourceScope: boolean;
    resourceWorkingMemory: boolean;
  } {
    return {
      selectByIncludeResourceScope: false,
      resourceWorkingMemory: false,
    };
  }

  abstract initialize({ name, schema }: { name: TABLE_NAMES; schema: Record<string, StorageColumn> }): Promise<void>;

  abstract teardown({ name }: { name: TABLE_NAMES }): Promise<void>;

  abstract migrate(args: {
    name: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void>;

  abstract load<R>({ name, keys }: { name: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null>;

  abstract insert({ name, record }: { name: TABLE_NAMES; record: Record<string, any> }): Promise<void>;

  abstract batchInsert({ name, records }: { name: TABLE_NAMES; records: Record<string, any>[] }): Promise<void>;

  protected ensureDate(date: Date | string | undefined): Date | undefined {
    if (!date) return undefined;
    return date instanceof Date ? date : new Date(date);
  }

  protected serializeDate(date: Date | string | undefined): string | undefined {
    if (!date) return undefined;
    const dateObj = this.ensureDate(date);
    return dateObj?.toISOString();
  }

  /**
   * Resolves limit for how many messages to fetch
   *
   * @param last The number of messages to fetch
   * @param defaultLimit The default limit to use if last is not provided
   * @returns The resolved limit
   */
  protected resolveMessageLimit({
    last,
    defaultLimit,
  }: {
    last: number | false | undefined;
    defaultLimit: number;
  }): number {
    // TODO: Figure out consistent default limit for all stores as some stores use 40 and some use no limit (Number.MAX_SAFE_INTEGER)
    if (typeof last === 'number') return Math.max(0, last);
    if (last === false) return 0;
    return defaultLimit;
  }

  protected getSqlType(type: StorageColumn['type']): string {
    switch (type) {
      case 'text':
        return 'TEXT';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'jsonb':
        return 'JSONB';
      default:
        return 'TEXT';
    }
  }

  protected getDefaultValue(type: StorageColumn['type']): string {
    switch (type) {
      case 'text':
      case 'uuid':
        return "DEFAULT ''";
      case 'timestamp':
        return "DEFAULT '1970-01-01 00:00:00'";
      case 'integer':
      case 'bigint':
        return 'DEFAULT 0';
      case 'jsonb':
        return "DEFAULT '{}'";
      default:
        return "DEFAULT ''";
    }
  }
}
