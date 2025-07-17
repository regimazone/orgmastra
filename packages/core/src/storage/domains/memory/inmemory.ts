import { MessageList } from "../../../agent/message-list";
import type { MastraMessageV1, MastraMessageV2, StorageThreadType } from "../../../memory/types";
import type { PaginationInfo, StorageGetMessagesArg, StorageResourceType } from "../../types";
import type { StoreOperations } from "../operations";
import { MemoryStorage } from "./base";

export type InMemoryThreads = Map<string, StorageThreadType>;
export type InMemoryResources = Map<string, StorageResourceType>;
export type InMemoryMessages = Map<string, MastraMessageV2>;

export class InMemoryMemory extends MemoryStorage {
    private collection: {
        threads: InMemoryThreads;
        resources: InMemoryResources;
        messages: InMemoryMessages;
    };
    private operations: StoreOperations;
    constructor({
        collection,
        operations,
    }: {
        collection: {
            threads: InMemoryThreads;
            resources: InMemoryResources;
            messages: InMemoryMessages;
        };
        operations: StoreOperations;
    }) {
        super();
        this.collection = collection;
        this.operations = operations;
    }

    async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
        this.logger.debug(`MockStore: getThreadById called for ${threadId}`);
        const thread = this.collection.threads.get(threadId);
        return thread ? (thread as StorageThreadType) : null;
    }

    async getThreadsByResourceId({ resourceId }: { resourceId: string }): Promise<StorageThreadType[]> {
        this.logger.debug(`MockStore: getThreadsByResourceId called for ${resourceId}`);
        // Mock implementation - find threads by resourceId
        const threads = Array.from(this.collection.threads.values()).filter((t: any) => t.resourceId === resourceId);
        return threads as StorageThreadType[];
    }

    async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
        this.logger.debug(`MockStore: saveThread called for ${thread.id}`);
        const key = thread.id;
        this.collection.threads.set(key, thread)
        return thread;
    }

    async updateThread({
        id,
        title,
        metadata,
    }: {
        id: string;
        title: string;
        metadata: Record<string, unknown>;
    }): Promise<StorageThreadType> {
        this.logger.debug(`MockStore: updateThread called for ${id}`);
        const thread = this.collection.threads.get(id);

        if (!thread) {
            throw new Error(`Thread with id ${id} not found`);
        }

        if (thread) {
            thread.title = title;
            thread.metadata = { ...thread.metadata, ...metadata };
            thread.updatedAt = new Date();
        }
        return thread;
    }

    async deleteThread({ threadId }: { threadId: string }): Promise<void> {
        this.logger.debug(`MockStore: deleteThread called for ${threadId}`);
        this.collection.threads.delete(threadId);

        this.collection.messages.forEach((msg, key) => {
            if (msg.threadId === threadId) {
                this.collection.messages.delete(key);
            }
        });
    }

    async getMessages<T extends MastraMessageV2[]>({ threadId, selectBy }: StorageGetMessagesArg): Promise<T> {
        this.logger.debug(`MockStore: getMessages called for thread ${threadId}`);
        // Mock implementation - filter messages by threadId
        let messages = Array.from(this.collection.messages.values()).filter((msg: any) => msg.threadId === threadId);

        // Apply selectBy logic (simplified)
        if (selectBy?.last) {
            messages = messages.slice(-selectBy.last);
        }

        // Sort by createdAt
        messages.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        return messages as T;
    }

    async saveMessages(args: { messages: MastraMessageV1[]; format?: undefined | 'v1' }): Promise<MastraMessageV1[]>;
    async saveMessages(args: { messages: MastraMessageV2[]; format: 'v2' }): Promise<MastraMessageV2[]>;
    async saveMessages(
        args: { messages: MastraMessageV1[]; format?: undefined | 'v1' } | { messages: MastraMessageV2[]; format: 'v2' },
    ): Promise<MastraMessageV2[] | MastraMessageV1[]> {
        const { messages, format = 'v1' } = args;
        this.logger.debug(`MockStore: saveMessages called with ${messages.length} messages`);
        for (const message of messages) {
            const key = message.id;
            this.collection.messages.set(key, message as MastraMessageV2);
        }

        const list = new MessageList().add(messages, 'memory');
        if (format === `v2`) return list.get.all.v2();
        return list.get.all.v1();
    }

    async updateMessages(args: { messages: Partial<MastraMessageV2> & { id: string }[] }): Promise<MastraMessageV2[]> {
        this.logger.debug(`MockStore: updateMessages called with ${args.messages.length} messages`);
        const messages = args.messages.map(m => this.collection.messages.get(m.id) as MastraMessageV2);
        return messages;
    }

    async getThreadsByResourceIdPaginated(args: {
        resourceId: string;
        page: number;
        perPage: number;
    }): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
        this.logger.debug(`MockStore: getThreadsByResourceIdPaginated called for ${args.resourceId}`);
        // Mock implementation - find threads by resourceId
        const threads = Array.from(this.collection.threads.values()).filter((t: any) => t.resourceId === args.resourceId) as StorageThreadType[];
        return {
            threads: threads.slice(args.page * args.perPage, (args.page + 1) * args.perPage),
            total: threads.length,
            page: args.page,
            perPage: args.perPage,
            hasMore: threads.length > (args.page + 1) * args.perPage,
        };
    }

    async getMessagesPaginated({
        threadId,
        selectBy,
    }: StorageGetMessagesArg & { format?: 'v1' | 'v2' }): Promise<
        PaginationInfo & { messages: MastraMessageV1[] | MastraMessageV2[] }
    > {
        this.logger.debug(`MockStore: getMessagesPaginated called for thread ${threadId}`);

        const { page = 0, perPage = 40 } = selectBy?.pagination || {};

        // Mock implementation - filter messages by threadId
        let messages = Array.from(this.collection.messages.values()).filter((msg: any) => msg.threadId === threadId);

        // Apply selectBy logic (simplified)
        if (selectBy?.last) {
            messages = messages.slice(-selectBy.last);
        }

        // Sort by createdAt
        messages.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const start = page * perPage;
        const end = start + perPage;
        return {
            messages: messages.slice(start, end),
            total: messages.length,
            page,
            perPage,
            hasMore: messages.length > end,
        };
    }

    async getResourceById({ resourceId }: { resourceId: string }): Promise<StorageResourceType | null> {
        this.logger.debug(`MockStore: getResourceById called for ${resourceId}`);
        const resource = this.collection.resources.get(resourceId);
        return resource ? (resource as StorageResourceType) : null;
    }

    async saveResource({ resource }: { resource: StorageResourceType }): Promise<StorageResourceType> {
        this.logger.debug(`MockStore: saveResource called for ${resource.id}`);
        this.collection.resources.set(resource.id, resource);
        return resource;
    }

    async updateResource({
        resourceId,
        workingMemory,
        metadata,
    }: {
        resourceId: string;
        workingMemory?: string;
        metadata?: Record<string, unknown>;
    }): Promise<StorageResourceType> {
        this.logger.debug(`MockStore: updateResource called for ${resourceId}`);
        let resource = this.collection.resources.get(resourceId);

        if (!resource) {
            // Create new resource if it doesn't exist
            resource = {
                id: resourceId,
                workingMemory,
                metadata: metadata || {},
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        } else {
            resource = {
                ...resource,
                workingMemory: workingMemory !== undefined ? workingMemory : resource.workingMemory,
                metadata: {
                    ...resource.metadata,
                    ...metadata,
                },
                updatedAt: new Date(),
            };
        }

        this.collection.resources.set(resourceId, resource);
        return resource;
    }

}