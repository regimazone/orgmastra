import { MastraMessageV1, MastraMessageV2, MastraStorage, StorageThreadType } from "@mastra/core";
import { describe, expect, it } from "vitest";
import { createSampleMessageV1, createSampleMessageV2, createSampleThread, createSampleThreadWithParams, resetRole } from "./data";
import { createMessagesPaginatedTest } from "./messages-paginated";


export function createConversationsTest({
    storage,
}: {
    storage: MastraStorage;
}) {

    describe('Thread Operations', () => {
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
    });

    describe('Message Operations', () => {
        it('should save and retrieve messages', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            const messages = [
                createSampleMessageV1({ threadId: thread.id }),
                createSampleMessageV1({ threadId: thread.id }),
            ];

            // Save messages
            const savedMessages = await storage.saveMessages({ messages });

            expect(savedMessages).toEqual(messages);

            // Retrieve messages
            const retrievedMessages = await storage.getMessages({ threadId: thread.id });

            expect(retrievedMessages).toHaveLength(2);

            expect(retrievedMessages).toEqual(expect.arrayContaining(messages));
        });

        it('should handle empty message array', async () => {
            const result = await storage.saveMessages({ messages: [] });
            expect(result).toEqual([]);
        });

        it('should maintain message order', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            const messages = [
                createSampleMessageV1({ threadId: thread.id, content: 'First' }),
                createSampleMessageV1({ threadId: thread.id, content: 'Second' }),
                createSampleMessageV1({ threadId: thread.id, content: 'Third' }),
            ];

            await storage.saveMessages({ messages });

            const retrievedMessages = await storage.getMessages({ threadId: thread.id });

            expect(retrievedMessages).toHaveLength(3);

            // Verify order is maintained
            retrievedMessages.forEach((msg, idx) => {
                // @ts-expect-error
                expect(msg.content[0].text).toBe(messages[idx].content[0].text);
            });
        });

        it('should rollback on error during message save', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            const messages = [
                createSampleMessageV1({ threadId: thread.id }),
                { ...createSampleMessageV1({ threadId: thread.id }), id: null }, // This will cause an error
            ] as MastraMessageV1[];

            await expect(storage.saveMessages({ messages })).rejects.toThrow();

            // Verify no messages were saved
            const savedMessages = await storage.getMessages({ threadId: thread.id });
            expect(savedMessages).toHaveLength(0);
        });

        it('should retrieve messages w/ next/prev messages by message id + resource id', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            const thread2 = createSampleThread();
            await storage.saveThread({ thread: thread2 });

            const thread3 = createSampleThread();
            await storage.saveThread({ thread: thread3 });

            const messages: MastraMessageV2[] = [
                createSampleMessageV2({
                    threadId: thread.id,
                    content: { content: 'First', parts: [{ type: 'text', text: 'First' }] },
                    resourceId: 'cross-thread-resource',
                }),
                createSampleMessageV2({
                    threadId: thread.id,
                    content: { content: 'Second', parts: [{ type: 'text', text: 'Second' }] },
                    resourceId: 'cross-thread-resource',
                }),
                createSampleMessageV2({
                    threadId: thread.id,
                    content: { content: 'Third', parts: [{ type: 'text', text: 'Third' }] },
                    resourceId: 'cross-thread-resource',
                }),

                createSampleMessageV2({
                    threadId: thread2.id,
                    content: { content: 'Fourth', parts: [{ type: 'text', text: 'Fourth' }] },
                    resourceId: 'cross-thread-resource',
                }),
                createSampleMessageV2({
                    threadId: thread2.id,
                    content: { content: 'Fifth', parts: [{ type: 'text', text: 'Fifth' }] },
                    resourceId: 'cross-thread-resource',
                }),
                createSampleMessageV2({
                    threadId: thread2.id,
                    content: { content: 'Sixth', parts: [{ type: 'text', text: 'Sixth' }] },
                    resourceId: 'cross-thread-resource',
                }),

                createSampleMessageV2({
                    threadId: thread3.id,
                    content: { content: 'Seventh', parts: [{ type: 'text', text: 'Seventh' }] },
                    resourceId: 'other-resource',
                }),
                createSampleMessageV2({
                    threadId: thread3.id,
                    content: { content: 'Eighth', parts: [{ type: 'text', text: 'Eighth' }] },
                    resourceId: 'other-resource',
                }),
            ];

            await storage.saveMessages({ messages: messages, format: 'v2' });

            const retrievedMessages = await storage.getMessages({ threadId: thread.id, format: 'v2' });
            expect(retrievedMessages).toHaveLength(3);
            const contentParts = retrievedMessages.map((m: any) =>
                m.content.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text),
            );
            expect(contentParts).toEqual([['First'], ['Second'], ['Third']]);

            const retrievedMessages2 = await storage.getMessages({ threadId: thread2.id, format: 'v2' });
            expect(retrievedMessages2).toHaveLength(3);
            const contentParts2 = retrievedMessages2.map((m: any) =>
                m.content.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text),
            );
            expect(contentParts2).toEqual([['Fourth'], ['Fifth'], ['Sixth']]);

            const retrievedMessages3 = await storage.getMessages({ threadId: thread3.id, format: 'v2' });
            expect(retrievedMessages3).toHaveLength(2);
            const contentParts3 = retrievedMessages3.map((m: any) =>
                m.content.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text),
            );
            expect(contentParts3).toEqual([['Seventh'], ['Eighth']]);

            const crossThreadMessages: MastraMessageV2[] = await storage.getMessages({
                threadId: thread.id,
                format: 'v2',
                selectBy: {
                    last: 0,
                    include: [
                        {
                            id: messages[1].id,
                            threadId: thread.id,
                            withNextMessages: 2,
                            withPreviousMessages: 2,
                        },
                        {
                            id: messages[4].id,
                            threadId: thread2.id,
                            withPreviousMessages: 2,
                            withNextMessages: 2,
                        },
                    ],
                },
            });

            expect(crossThreadMessages).toHaveLength(6);
            expect(crossThreadMessages.filter(m => m.threadId === thread.id)).toHaveLength(3);
            expect(crossThreadMessages.filter(m => m.threadId === thread2.id)).toHaveLength(3);

            const crossThreadMessages2: MastraMessageV2[] = await storage.getMessages({
                threadId: thread.id,
                format: 'v2',
                selectBy: {
                    last: 0,
                    include: [
                        {
                            id: messages[4].id,
                            threadId: thread2.id,
                            withPreviousMessages: 1,
                            withNextMessages: 30,
                        },
                    ],
                },
            });

            expect(crossThreadMessages2).toHaveLength(3);
            expect(crossThreadMessages2.filter(m => m.threadId === thread.id)).toHaveLength(0);
            expect(crossThreadMessages2.filter(m => m.threadId === thread2.id)).toHaveLength(3);

            const crossThreadMessages3: MastraMessageV2[] = await storage.getMessages({
                threadId: thread2.id,
                format: 'v2',
                selectBy: {
                    last: 0,
                    include: [
                        {
                            id: messages[1].id,
                            threadId: thread.id,
                            withNextMessages: 1,
                            withPreviousMessages: 1,
                        },
                    ],
                },
            });

            expect(crossThreadMessages3).toHaveLength(3);
            expect(crossThreadMessages3.filter(m => m.threadId === thread.id)).toHaveLength(3);
            expect(crossThreadMessages3.filter(m => m.threadId === thread2.id)).toHaveLength(0);
        });

        it('should update thread timestamp when saving messages', async () => {
            const thread = createSampleThread();
            await storage.saveThread({ thread });

            const initialThread = await storage.getThreadById({ threadId: thread.id });
            const initialUpdatedAt = new Date(initialThread!.updatedAt);

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            const messages = [
                createSampleMessageV1({ threadId: thread.id }),
                createSampleMessageV1({ threadId: thread.id }),
            ];
            await storage.saveMessages({ messages });

            // Verify thread updatedAt timestamp was updated
            const updatedThread = await storage.getThreadById({ threadId: thread.id });
            const newUpdatedAt = new Date(updatedThread!.updatedAt);
            expect(newUpdatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
        });

        it('should upsert messages: duplicate id+threadId results in update, not duplicate row', async () => {
            const thread = await createSampleThread();
            await storage.saveThread({ thread });
            const baseMessage = createSampleMessageV2({
                threadId: thread.id,
                createdAt: new Date(),
                content: { content: 'Original' },
                resourceId: thread.resourceId,
            });

            // Insert the message for the first time
            await storage.saveMessages({ messages: [baseMessage], format: 'v2' });

            // Insert again with the same id and threadId but different content
            const updatedMessage = {
                ...createSampleMessageV2({
                    threadId: thread.id,
                    createdAt: new Date(),
                    content: { content: 'Updated' },
                    resourceId: thread.resourceId,
                }),
                id: baseMessage.id,
            };

            await storage.saveMessages({ messages: [updatedMessage], format: 'v2' });
            await new Promise(resolve => setTimeout(resolve, 500));

            // Retrieve messages for the thread
            const retrievedMessages = await storage.getMessages({ threadId: thread.id, format: 'v2' });

            // Only one message should exist for that id+threadId
            expect(retrievedMessages.filter(m => m.id === baseMessage.id)).toHaveLength(1);

            // The content should be the updated one
            expect(retrievedMessages.find(m => m.id === baseMessage.id)?.content.content).toBe('Updated');
        });

        it('should upsert messages: duplicate id and different threadid', async () => {
            const thread1 = await createSampleThread();
            const thread2 = await createSampleThread();
            await storage.saveThread({ thread: thread1 });
            await storage.saveThread({ thread: thread2 });

            const message = createSampleMessageV2({
                threadId: thread1.id,
                createdAt: new Date(),
                content: { content: 'Thread1 Content' },
                resourceId: thread1.resourceId,
            });

            // Insert message into thread1
            await storage.saveMessages({ messages: [message], format: 'v2' });

            // Attempt to insert a message with the same id but different threadId
            const conflictingMessage = {
                ...createSampleMessageV2({
                    threadId: thread2.id, // different thread
                    content: { content: 'Thread2 Content' },
                    resourceId: thread2.resourceId,
                }),
                id: message.id,
            };

            // Save should move the message to the new thread
            await storage.saveMessages({ messages: [conflictingMessage], format: 'v2' });

            // Retrieve messages for both threads
            const thread1Messages = await storage.getMessages({ threadId: thread1.id, format: 'v2' });
            const thread2Messages = await storage.getMessages({ threadId: thread2.id, format: 'v2' });

            // Thread 1 should NOT have the message with that id
            expect(thread1Messages.find(m => m.id === message.id)).toBeUndefined();

            // Thread 2 should have the message with that id
            expect(thread2Messages.find(m => m.id === message.id)?.content.content).toBe('Thread2 Content');
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
}