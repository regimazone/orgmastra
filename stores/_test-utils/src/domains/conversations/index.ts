import type { MastraMessageV2, MastraStorage, MastraMessageV1, StorageThreadType } from "@mastra/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createSampleMessageV1, createSampleMessageV2, createSampleThread, createSampleThreadWithParams, resetRole } from "./data";
import { createMessagesPaginatedTest } from "./messages-paginated";
import { randomUUID } from "node:crypto";
import { TABLE_MESSAGES, TABLE_THREADS } from "@mastra/core/storage";


export function createConversationsTest({
    storage,
}: {
    storage: MastraStorage;
}) {
    describe('Threads', () => {
        it('should create and retrieve a thread', async () => {
            const thread = createSampleThread();

            // Save thread
            const savedThread = await storage.saveThread({ thread });
            expect(savedThread).toEqual(thread);

            // Retrieve thread
            const retrievedThread = await storage.getThreadById({ threadId: thread.id });
            expect(retrievedThread?.title).toEqual(thread.title);
        });

        it('should create and retrieve a thread with the same given threadId and resourceId', async () => {
            const exampleThreadId = '1346362547862769664';
            const exampleResourceId = '532374164040974346';
            const createdAt = new Date();
            const updatedAt = new Date();
            const thread = createSampleThreadWithParams(exampleThreadId, exampleResourceId, createdAt, updatedAt);

            // Save thread
            const savedThread = await storage.saveThread({ thread });
            expect(savedThread).toEqual(thread);

            // Retrieve thread
            const retrievedThread = await storage.getThreadById({ threadId: thread.id });
            expect(retrievedThread?.id).toEqual(exampleThreadId);
            expect(retrievedThread?.resourceId).toEqual(exampleResourceId);
            expect(retrievedThread?.title).toEqual(thread.title);

            if (retrievedThread?.createdAt instanceof Date) {
                expect(retrievedThread?.createdAt.toISOString()).toEqual(createdAt.toISOString());
            } else {
                expect(retrievedThread?.createdAt).toEqual(createdAt.toISOString());
            }

            if (retrievedThread?.updatedAt instanceof Date) {
                expect(retrievedThread?.updatedAt.toISOString()).toEqual(updatedAt.toISOString());
            } else {
                expect(retrievedThread?.updatedAt).toEqual(updatedAt.toISOString());
            }
        });

        it('should return null for non-existent thread', async () => {
            const result = await storage.getThreadById({ threadId: 'non-existent' });
            expect(result).toBeNull();
        });

        it('should get threads by resource ID', async () => {
            const thread1 = createSampleThread();
            const thread2 = { ...createSampleThread(), resourceId: thread1.resourceId };

            await storage.saveThread({ thread: thread1 });
            await storage.saveThread({ thread: thread2 });

            const threads = await storage.getThreadsByResourceId({ resourceId: thread1.resourceId });
            expect(threads).toHaveLength(2);
            expect(threads.map(t => t.id)).toEqual(expect.arrayContaining([thread1.id, thread2.id]));
        });

        it('should update thread title and metadata', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            const newMetadata = { newKey: 'newValue' };
            const updatedThread = await storage.updateThread({
                id: thread.id,
                title: 'Updated Title',
                metadata: newMetadata,
            });

            expect(updatedThread.title).toBe('Updated Title');
            expect(updatedThread.metadata).toEqual({
                ...thread.metadata,
                ...newMetadata,
            });

            // Verify persistence
            const retrievedThread = await storage.getThreadById({ threadId: thread.id });
            expect(retrievedThread).toEqual(updatedThread);
        });

        it('should delete thread', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            await storage.deleteThread({ threadId: thread.id });

            const retrievedThread = await storage.getThreadById({ threadId: thread.id });
            expect(retrievedThread).toBeNull();
        });

        it('should delete thread and its messages', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            // Add some messages
            const messages = [
                createSampleMessageV2({ threadId: thread.id }),
                createSampleMessageV2({ threadId: thread.id }),
            ];
            await storage.saveMessages({ messages, format: 'v2' });

            await storage.deleteThread({ threadId: thread.id });

            const retrievedThread = await storage.getThreadById({ threadId: thread.id });
            expect(retrievedThread).toBeNull();

            // Verify messages were also deleted
            const retrievedMessages = await storage.getMessages({ threadId: thread.id });
            expect(retrievedMessages).toHaveLength(0);
        });

        it('should update thread updatedAt when a message is saved to it', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            // Get the initial thread to capture the original updatedAt
            const initialThread = await storage.getThreadById({ threadId: thread.id });
            expect(initialThread).toBeDefined();
            const originalUpdatedAt = initialThread!.updatedAt;

            // Wait a small amount to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 10));

            // Create and save a message to the thread
            const message = createSampleMessageV1({ threadId: thread.id });
            await storage.saveMessages({ messages: [message] });

            // Retrieve the thread again and check that updatedAt was updated
            const updatedThread = await storage.getThreadById({ threadId: thread.id });
            expect(updatedThread).toBeDefined();

            let originalUpdatedAtTime: number;

            if (updatedThread!.updatedAt instanceof Date) {
                originalUpdatedAtTime = originalUpdatedAt.getTime();
            } else {
                originalUpdatedAtTime = new Date(originalUpdatedAt).getTime();
            }

            if (updatedThread!.updatedAt instanceof Date) {
                expect(updatedThread!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAtTime);
            } else {
                expect(new Date(updatedThread!.updatedAt).getTime()).toBeGreaterThan(originalUpdatedAtTime);
            }
        });

        it('should handle stringified JSON content without double-nesting', async () => {
            const threadData = createSampleThread();
            const thread = await storage.saveThread({ thread: threadData as StorageThreadType });

            // Simulate user passing stringified JSON as message content (like the original bug report)
            const stringifiedContent = JSON.stringify({ userInput: 'test data', metadata: { key: 'value' } });
            const message: MastraMessageV2 = {
                id: `msg-${randomUUID()}`,
                role: 'user',
                threadId: thread.id,
                resourceId: thread.resourceId,
                content: {
                    format: 2,
                    parts: [{ type: 'text', text: stringifiedContent }],
                    content: stringifiedContent, // This is the stringified JSON that user passed
                },
                createdAt: new Date(),
            };

            // Save the message - this should stringify the whole content object for storage
            await storage.saveMessages({ messages: [message], format: 'v2' });

            // Retrieve the message - this is where double-nesting could occur
            const retrievedMessages = await storage.getMessages({ threadId: thread.id, format: 'v2' });
            expect(retrievedMessages).toHaveLength(1);

            const retrievedMessage = retrievedMessages[0] as MastraMessageV2;

            // Check that content is properly structured as a V2 message
            expect(typeof retrievedMessage.content).toBe('object');
            expect(retrievedMessage.content.format).toBe(2);

            // CRITICAL: The content.content should still be the original stringified JSON
            // NOT double-nested like: { content: '{"format":2,"parts":[...],"content":"{\\"userInput\\":\\"test data\\"}"}' }
            expect(retrievedMessage.content.content).toBe(stringifiedContent);

            // Verify the content can be parsed as the original JSON
            const parsedContent = JSON.parse(retrievedMessage.content.content as string);
            expect(parsedContent).toEqual({ userInput: 'test data', metadata: { key: 'value' } });

            // Additional check: ensure the message doesn't have the "Found unhandled message" structure
            expect(retrievedMessage.content.parts).toBeDefined();
            expect(Array.isArray(retrievedMessage.content.parts)).toBe(true);
        });


        it('should return paginated threads with total count', async () => {
            const resourceId = `pg-paginated-resource-${randomUUID()}`;
            const threadPromises = Array.from({ length: 17 }, () =>
                storage.saveThread({ thread: { ...createSampleThread(), resourceId } }),
            );
            await Promise.all(threadPromises);

            const page1 = await storage.getThreadsByResourceIdPaginated({ resourceId, page: 0, perPage: 7 });
            expect(page1.threads).toHaveLength(7);
            expect(page1.total).toBe(17);
            expect(page1.page).toBe(0);
            expect(page1.perPage).toBe(7);
            expect(page1.hasMore).toBe(true);

            const page3 = await storage.getThreadsByResourceIdPaginated({ resourceId, page: 2, perPage: 7 });
            expect(page3.threads).toHaveLength(3); // 17 total, 7 per page, 3rd page has 17 - 2*7 = 3
            expect(page3.total).toBe(17);
            expect(page3.hasMore).toBe(false);
        });

        it('should return paginated results when no pagination params for getThreadsByResourceId', async () => {
            const resourceId = `pg-non-paginated-resource-${randomUUID()}`;
            await storage.saveThread({ thread: { ...createSampleThread(), resourceId } });

            const results = await storage.getThreadsByResourceIdPaginated({ resourceId, page: 0, perPage: 100 });
            expect(Array.isArray(results.threads)).toBe(true);
            expect(results.threads.length).toBe(1);
            expect(results.total).toBe(1);
            expect(results.page).toBe(0);
            expect(results.perPage).toBe(100);
            expect(results.hasMore).toBe(false);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle large metadata objects', async () => {
            const thread = createSampleThread();
            const largeMetadata = {
                ...thread.metadata,
                largeArray: Array.from({ length: 1000 }, (_, i) => ({ index: i, data: 'test'.repeat(100) })),
            };

            const threadWithLargeMetadata = {
                ...thread,
                metadata: largeMetadata,
            };

            await storage.saveThread({ thread: threadWithLargeMetadata });
            const retrieved = await storage.getThreadById({ threadId: thread.id });

            expect(retrieved?.metadata).toEqual(largeMetadata);
        });

        it('should handle special characters in thread titles', async () => {
            const thread = {
                ...createSampleThread(),
                title: 'Special \'quotes\' and "double quotes" and emoji 🎉',
            };

            await storage.saveThread({ thread });
            const retrieved = await storage.getThreadById({ threadId: thread.id });

            expect(retrieved?.title).toBe(thread.title);
        });

        it('should handle concurrent thread updates', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            // Perform multiple updates concurrently
            const updates = Array.from({ length: 5 }, (_, i) =>
                storage.updateThread({
                    id: thread.id,
                    title: `Update ${i}`,
                    metadata: { update: i },
                }),
            );

            await expect(Promise.all(updates)).resolves.toBeDefined();

            // Verify final state
            const finalThread = await storage.getThreadById({ threadId: thread.id });
            expect(finalThread).toBeDefined();
        });
    });

    createMessagesPaginatedTest({ storage });

    // describe('updateMessages', () => {
    //     let thread: StorageThreadType;
    //     beforeEach(async () => {
    //         await storage.clearTable({ tableName: TABLE_MESSAGES });
    //         await storage.clearTable({ tableName: TABLE_THREADS });
    //         const threadData = createSampleThread();
    //         thread = await storage.saveThread({ thread: threadData as StorageThreadType });
    //     });

    //     it('should update a single field of a message (e.g., role)', async () => {
    //         const originalMessage = createSampleMessageV2({ threadId: thread.id, role: 'user' });
    //         await storage.saveMessages({ messages: [originalMessage], format: 'v2' });

    //         const updatedMessages = await storage.updateMessages({
    //             messages: [{ id: originalMessage.id, role: 'assistant' }] as MastraMessageV2[],
    //         });

    //         expect(updatedMessages).toHaveLength(1);
    //         expect(updatedMessages[0]!.role).toBe('assistant');

    //         const fromDb = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         expect(fromDb[0]!.role).toBe('assistant');
    //     });

    //     it('should update only the metadata within the content field, preserving other content fields', async () => {
    //         const originalMessage = createSampleMessageV2({
    //             threadId: thread.id,
    //             content: { content: 'hello world', parts: [{ type: 'text', text: 'hello world' }] },
    //         });
    //         await storage.saveMessages({ messages: [originalMessage], format: 'v2' });

    //         const newMetadata = { someKey: 'someValue' };
    //         await storage.updateMessages({
    //             messages: [{ id: originalMessage.id, content: { metadata: newMetadata } as any }],
    //         });

    //         const fromDb = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         expect(fromDb).toHaveLength(1);
    //         expect(fromDb[0]!.content.metadata).toEqual(newMetadata);
    //         expect(fromDb[0]!.content.content).toBe('hello world');
    //         expect(fromDb[0]!.content.parts).toEqual([{ type: 'text', text: 'hello world' }]);
    //     });

    //     it('should update only the content string within the content field, preserving metadata', async () => {
    //         const originalMessage = createSampleMessageV2({
    //             threadId: thread.id,
    //             content: { metadata: { initial: true } },
    //         });
    //         await storage.saveMessages({ messages: [originalMessage], format: 'v2' });

    //         const newContentString = 'This is the new content string';
    //         await storage.updateMessages({
    //             messages: [{ id: originalMessage.id, content: { content: newContentString } as any }],
    //         });

    //         const fromDb = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         expect(fromDb[0]!.content.content).toBe(newContentString);
    //         expect(fromDb[0]!.content.metadata).toEqual({ initial: true });
    //     });

    //     it('should deep merge metadata, not overwrite it', async () => {
    //         const originalMessage = createSampleMessageV2({
    //             threadId: thread.id,
    //             content: { metadata: { initial: true }, content: 'old content' },
    //         });
    //         await storage.saveMessages({ messages: [originalMessage], format: 'v2' });

    //         const newMetadata = { updated: true };
    //         await storage.updateMessages({
    //             messages: [{ id: originalMessage.id, content: { metadata: newMetadata } as any }],
    //         });

    //         const fromDb = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         expect(fromDb[0]!.content.content).toBe('old content');
    //         expect(fromDb[0]!.content.metadata).toEqual({ initial: true, updated: true });
    //     });

    //     it('should update multiple messages at once', async () => {
    //         const msg1 = createSampleMessageV2({ threadId: thread.id, role: 'user' });
    //         const msg2 = createSampleMessageV2({ threadId: thread.id, content: { content: 'original' } });
    //         await storage.saveMessages({ messages: [msg1, msg2], format: 'v2' });

    //         await storage.updateMessages({
    //             messages: [
    //                 { id: msg1.id, role: 'assistant' } as MastraMessageV2,
    //                 { id: msg2.id, content: { content: 'updated' } as any },
    //             ],
    //         });

    //         const fromDb = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         const updatedMsg1 = fromDb.find(m => m.id === msg1.id);
    //         const updatedMsg2 = fromDb.find(m => m.id === msg2.id);

    //         expect(updatedMsg1!.role).toBe('assistant');
    //         expect(updatedMsg2!.content.content).toBe('updated');
    //     });

    //     it('should update the parent thread updatedAt timestamp', async () => {
    //         const originalMessage = createSampleMessageV2({ threadId: thread.id });
    //         await storage.saveMessages({ messages: [originalMessage], format: 'v2' });
    //         const initialThread = await storage.getThreadById({ threadId: thread.id });

    //         await new Promise(r => setTimeout(r, 10));

    //         await storage.updateMessages({ messages: [{ id: originalMessage.id, role: 'assistant' }] as MastraMessageV2[] });

    //         const updatedThread = await storage.getThreadById({ threadId: thread.id });

    //         expect(new Date(updatedThread!.updatedAt).getTime()).toBeGreaterThan(new Date(initialThread!.updatedAt).getTime());
    //     });

    //     it('should update timestamps on both threads when moving a message', async () => {
    //         const thread2 = await storage.saveThread({ thread: createSampleThread() });
    //         const message = createSampleMessageV2({ threadId: thread.id });
    //         await storage.saveMessages({ messages: [message], format: 'v2' });

    //         const initialThread1 = await storage.getThreadById({ threadId: thread.id });
    //         const initialThread2 = await storage.getThreadById({ threadId: thread2.id });

    //         await new Promise(r => setTimeout(r, 10));

    //         await storage.updateMessages({
    //             messages: [{ id: message.id, threadId: thread2.id } as MastraMessageV2],
    //         });

    //         const updatedThread1 = await storage.getThreadById({ threadId: thread.id });
    //         const updatedThread2 = await storage.getThreadById({ threadId: thread2.id });

    //         expect(new Date(updatedThread1!.updatedAt).getTime()).toBeGreaterThan(
    //             new Date(initialThread1!.updatedAt).getTime(),
    //         );
    //         expect(new Date(updatedThread2!.updatedAt).getTime()).toBeGreaterThan(
    //             new Date(initialThread2!.updatedAt).getTime(),
    //         );

    //         // Verify the message was moved
    //         const thread1Messages = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         const thread2Messages = await storage.getMessages({ threadId: thread2.id, format: 'v2' });
    //         expect(thread1Messages).toHaveLength(0);
    //         expect(thread2Messages).toHaveLength(1);
    //         expect(thread2Messages[0]!.id).toBe(message.id);
    //     });

    //     it('should not fail when trying to update a non-existent message', async () => {
    //         const originalMessage = createSampleMessageV2({ threadId: thread.id });
    //         await storage.saveMessages({ messages: [originalMessage], format: 'v2' });


    //         const messages = [{ id: randomUUID(), role: 'assistant' }] as MastraMessageV2[]

    //         await expect(
    //             storage.updateMessages({
    //                 messages,
    //             }),
    //         ).resolves.not.toThrow();

    //         const fromDb = await storage.getMessages({ threadId: thread.id, format: 'v2' });
    //         expect(fromDb[0]!.role).toBe(originalMessage.role);
    //     });
    // });




    // createMessagesPaginatedTest({ storage });
}