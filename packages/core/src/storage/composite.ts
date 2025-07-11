import { MastraStorage } from "./base";
import {
    TABLE_TRACES,
    TABLE_MESSAGES,
    TABLE_THREADS,
    TABLE_RESOURCES,
    TABLE_WORKFLOW_SNAPSHOT,
    TABLE_EVALS,
} from "./constants";
import type { TABLE_NAMES, StorageColumn } from "./types";

export class MastraCompositeStorage extends MastraStorage {
    #stores: {
        traces: MastraStorage,
        conversations: MastraStorage,
        workflows: MastraStorage,
        scores: MastraStorage,
    };

    constructor(stores: {
        traces: MastraStorage,
        conversations: MastraStorage,
        workflows: MastraStorage,
        scores: MastraStorage,
    }) {
        super({
            name: 'COMPOSITE_STORAGE',
        });

        this.#stores = stores;
    }

    async createTable({ tableName, schema }: { tableName: TABLE_NAMES; schema: Record<string, StorageColumn> }): Promise<void> {
        if (tableName === TABLE_TRACES) {
            await this.#stores.traces.createTable({ tableName, schema });
        } else if (tableName === TABLE_MESSAGES || tableName === TABLE_THREADS || tableName === TABLE_RESOURCES) {
            await this.#stores.conversations.createTable({ tableName, schema });
        } else if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
            await this.#stores.workflows.createTable({ tableName, schema });
        } else if (tableName === TABLE_EVALS) {
            await this.#stores.scores.createTable({ tableName, schema });
        }
    }

    async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
        if (tableName === TABLE_TRACES) {
            await this.#stores.traces.clearTable({ tableName });
        } else if (tableName === TABLE_MESSAGES || tableName === TABLE_THREADS || tableName === TABLE_RESOURCES) {
            await this.#stores.conversations.clearTable({ tableName });
        } else if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
            await this.#stores.workflows.clearTable({ tableName });
        } else if (tableName === TABLE_EVALS) {
            await this.#stores.scores.clearTable({ tableName });
        }
    }

    async alterTable(args: { tableName: TABLE_NAMES; schema: Record<string, StorageColumn>; ifNotExists: string[] }): Promise<void> {
        if (args.tableName === TABLE_MESSAGES || args.tableName === TABLE_THREADS || args.tableName === TABLE_RESOURCES) {
            await this.#stores.conversations.alterTable(args);
        }
        if (args.tableName === TABLE_WORKFLOW_SNAPSHOT) {
            await this.#stores.workflows.alterTable(args);
        }
        if (args.tableName === TABLE_EVALS) {
            await this.#stores.scores.alterTable(args);
        }
    }

    async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
        if (tableName === TABLE_TRACES) {
            await this.#stores.traces.insert({ tableName, record });
        } else if (tableName === TABLE_MESSAGES || tableName === TABLE_THREADS || tableName === TABLE_RESOURCES) {
            await this.#stores.conversations.insert({ tableName, record });
        } else if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
            await this.#stores.workflows.insert({ tableName, record });
        } else if (tableName === TABLE_EVALS) {
            await this.#stores.scores.insert({ tableName, record });
        }
    }

    async batchInsert({ tableName, records }: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
        if (tableName === TABLE_TRACES) {
            await this.#stores.traces.batchInsert({ tableName, records });
        }
    }

    async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null> {
        if (tableName === TABLE_TRACES) {
            return this.#stores.traces.load({ tableName, keys });
        }
        if (tableName === TABLE_MESSAGES || tableName === TABLE_THREADS || tableName === TABLE_RESOURCES) {
            return this.#stores.conversations.load({ tableName, keys });
        }
        if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
            return this.#stores.workflows.load({ tableName, keys });
        }
        if (tableName === TABLE_EVALS) {
            return this.#stores.scores.load({ tableName, keys });
        }
    }

    async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
        return this.#stores.conversations.getThreadById({ threadId });
    }

    async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
        return this.#stores.conversations.getThreadsByResourceId({ resourceId });
    }

    async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
        return this.#stores.conversations.saveThread({ thread });
    }

    async updateThread({ id, title, metadata }: { id: string; title: string; metadata: Record<string, unknown> }): Promise<StorageThreadType> {
        return this.#stores.conversations.updateThread({ id, title, metadata });
    }

    async deleteThread({ threadId }: { threadId: string }): Promise<void> {
        return this.#stores.conversations.deleteThread({ threadId });
    }
}