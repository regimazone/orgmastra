import {
  createTestSuite,
} from '@internal/storage-test-utils';
import { vi } from 'vitest';

import { PostgresStore } from '.';
import type { PostgresConfig } from '.';

const TEST_CONFIG: PostgresConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5434,
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
};

// const connectionString = `postgresql://${TEST_CONFIG.user}:${TEST_CONFIG.password}@${TEST_CONFIG.host}:${TEST_CONFIG.port}/${TEST_CONFIG.database}`;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });


createTestSuite(new PostgresStore(TEST_CONFIG));

// describe('PostgresStore', () => {
//   let store: PostgresStore;

//   beforeAll(async () => {
//     store = new PostgresStore(TEST_CONFIG);
//     await store.init();
//   });

//   describe('Public Fields Access', () => {
//     let testDB: PostgresStore;
//     beforeAll(async () => {
//       testDB = new PostgresStore(TEST_CONFIG);
//     });
//     afterAll(async () => {
//       try {
//         await testDB.close();
//       } catch { }
//       store = new PostgresStore(TEST_CONFIG);
//       await store.init();
//     });

//     it('should expose db field as public', () => {
//       expect(testDB.db).toBeDefined();
//       expect(typeof testDB.db).toBe('object');
//       expect(testDB.db.query).toBeDefined();
//       expect(typeof testDB.db.query).toBe('function');
//     });

//     it('should expose pgp field as public', () => {
//       expect(testDB.pgp).toBeDefined();
//       expect(typeof testDB.pgp).toBe('function');
//       expect(testDB.pgp.end).toBeDefined();
//       expect(typeof testDB.pgp.end).toBe('function');
//     });

//     it('should allow direct database queries via public db field', async () => {
//       const result = await testDB.db.one('SELECT 1 as test');
//       expect(result.test).toBe(1);
//     });

//     it('should allow access to pgp utilities via public pgp field', () => {
//       const helpers = testDB.pgp.helpers;
//       expect(helpers).toBeDefined();
//       expect(helpers.insert).toBeDefined();
//       expect(helpers.update).toBeDefined();
//     });

//     it('should maintain connection state through public db field', async () => {
//       // Test multiple queries to ensure connection state
//       const result1 = await testDB.db.one('SELECT NOW() as timestamp1');
//       const result2 = await testDB.db.one('SELECT NOW() as timestamp2');

//       expect(result1.timestamp1).toBeDefined();
//       expect(result2.timestamp2).toBeDefined();
//       expect(new Date(result2.timestamp2).getTime()).toBeGreaterThanOrEqual(new Date(result1.timestamp1).getTime());
//     });

//     it('should throw error when pool is used after disconnect', async () => {
//       await testDB.close();
//       expect(testDB.db.connect()).rejects.toThrow();
//     });
//   });

//   beforeEach(async () => {
//     // Only clear tables if store is initialized
//     try {
//       // Clear tables before each test
//       await store.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
//       await store.clearTable({ tableName: TABLE_MESSAGES });
//       await store.clearTable({ tableName: TABLE_THREADS });
//       await store.clearTable({ tableName: TABLE_EVALS });
//       await store.clearTable({ tableName: TABLE_TRACES });
//     } catch (error) {
//       // Ignore errors during table clearing
//       console.warn('Error clearing tables:', error);
//     }
//   });

//   // --- Validation tests ---
//   describe('Validation', () => {
//     const validConfig = TEST_CONFIG;
//     it('throws if connectionString is empty', () => {
//       expect(() => new PostgresStore({ connectionString: '' })).toThrow(
//         /connectionString must be provided and cannot be empty/,
//       );
//     });
//     it('throws if host is missing or empty', () => {
//       expect(() => new PostgresStore({ ...validConfig, host: '' })).toThrow(
//         /host must be provided and cannot be empty/,
//       );
//       const { host, ...rest } = validConfig;
//       expect(() => new PostgresStore(rest as any)).toThrow(/host must be provided and cannot be empty/);
//     });
//     it('throws if user is missing or empty', () => {
//       expect(() => new PostgresStore({ ...validConfig, user: '' })).toThrow(
//         /user must be provided and cannot be empty/,
//       );
//       const { user, ...rest } = validConfig;
//       expect(() => new PostgresStore(rest as any)).toThrow(/user must be provided and cannot be empty/);
//     });
//     it('throws if database is missing or empty', () => {
//       expect(() => new PostgresStore({ ...validConfig, database: '' })).toThrow(
//         /database must be provided and cannot be empty/,
//       );
//       const { database, ...rest } = validConfig;
//       expect(() => new PostgresStore(rest as any)).toThrow(/database must be provided and cannot be empty/);
//     });
//     it('throws if password is missing or empty', () => {
//       expect(() => new PostgresStore({ ...validConfig, password: '' })).toThrow(
//         /password must be provided and cannot be empty/,
//       );
//       const { password, ...rest } = validConfig;
//       expect(() => new PostgresStore(rest as any)).toThrow(/password must be provided and cannot be empty/);
//     });
//     it('does not throw on valid config (host-based)', () => {
//       expect(() => new PostgresStore(validConfig)).not.toThrow();
//     });
//     it('does not throw on non-empty connection string', () => {
//       expect(() => new PostgresStore({ connectionString })).not.toThrow();
//     });
//   });


//   describe('updateMessages', () => {
//     let thread: StorageThreadType;

//     beforeEach(async () => {
//       const threadData = createSampleThread();
//       thread = await store.saveThread({ thread: threadData as StorageThreadType });
//     });

//     it('should update a single field of a message (e.g., role)', async () => {
//       const originalMessage = createSampleMessageV2({ threadId: thread.id, role: 'user', thread });
//       await store.saveMessages({ messages: [originalMessage], format: 'v2' });

//       const updatedMessages = await store.updateMessages({
//         messages: [{ id: originalMessage.id, role: 'assistant' }],
//       });

//       expect(updatedMessages).toHaveLength(1);
//       expect(updatedMessages[0].role).toBe('assistant');
//       expect(updatedMessages[0].content).toEqual(originalMessage.content); // Ensure content is unchanged
//     });

//     it('should update only the metadata within the content field, preserving other content', async () => {
//       const originalMessage = createSampleMessageV2({
//         threadId: thread.id,
//         content: { content: 'hello world', parts: [{ type: 'text', text: 'hello world' }] },
//         thread,
//       });
//       await store.saveMessages({ messages: [originalMessage], format: 'v2' });

//       const newMetadata = { someKey: 'someValue' };
//       await store.updateMessages({
//         messages: [{ id: originalMessage.id, content: { metadata: newMetadata } as any }],
//       });

//       const fromDb = await store.getMessages({ threadId: thread.id, format: 'v2' });
//       expect(fromDb[0].content.metadata).toEqual(newMetadata);
//       expect(fromDb[0].content.content).toBe('hello world');
//       expect(fromDb[0].content.parts).toEqual([{ type: 'text', text: 'hello world' }]);
//     });

//     it('should deep merge metadata, not overwrite it', async () => {
//       const originalMessage = createSampleMessageV2({
//         threadId: thread.id,
//         content: { metadata: { initial: true }, content: 'old content' },
//         thread,
//       });
//       await store.saveMessages({ messages: [originalMessage], format: 'v2' });

//       const newMetadata = { updated: true };
//       await store.updateMessages({
//         messages: [{ id: originalMessage.id, content: { metadata: newMetadata } as any }],
//       });

//       const fromDb = await store.getMessages({ threadId: thread.id, format: 'v2' });
//       expect(fromDb[0].content.metadata).toEqual({ initial: true, updated: true });
//     });

//     it('should update multiple messages at once', async () => {
//       const msg1 = createSampleMessageV2({ threadId: thread.id, role: 'user', thread });
//       const msg2 = createSampleMessageV2({ threadId: thread.id, content: { content: 'original' }, thread });
//       await store.saveMessages({ messages: [msg1, msg2], format: 'v2' });

//       await store.updateMessages({
//         messages: [
//           { id: msg1.id, role: 'assistant' },
//           { id: msg2.id, content: { content: 'updated' } as any },
//         ],
//       });

//       const fromDb = await store.getMessages({ threadId: thread.id, format: 'v2' });
//       const updatedMsg1 = fromDb.find(m => m.id === msg1.id)!;
//       const updatedMsg2 = fromDb.find(m => m.id === msg2.id)!;

//       expect(updatedMsg1.role).toBe('assistant');
//       expect(updatedMsg2.content.content).toBe('updated');
//     });

//     it('should update the parent thread updatedAt timestamp', async () => {
//       const originalMessage = createSampleMessageV2({ threadId: thread.id, thread });
//       await store.saveMessages({ messages: [originalMessage], format: 'v2' });
//       const initialThread = await store.getThreadById({ threadId: thread.id });

//       await new Promise(r => setTimeout(r, 10));

//       await store.updateMessages({ messages: [{ id: originalMessage.id, role: 'assistant' }] });

//       const updatedThread = await store.getThreadById({ threadId: thread.id });

//       expect(new Date(updatedThread!.updatedAt).getTime()).toBeGreaterThan(
//         new Date(initialThread!.updatedAt).getTime(),
//       );
//     });

//     it('should update timestamps on both threads when moving a message', async () => {
//       const thread2 = await store.saveThread({ thread: createSampleThread() });
//       const message = createSampleMessageV2({ threadId: thread.id, thread });
//       await store.saveMessages({ messages: [message], format: 'v2' });

//       const initialThread1 = await store.getThreadById({ threadId: thread.id });
//       const initialThread2 = await store.getThreadById({ threadId: thread2.id });

//       await new Promise(r => setTimeout(r, 10));

//       await store.updateMessages({
//         messages: [{ id: message.id, threadId: thread2.id }],
//       });

//       const updatedThread1 = await store.getThreadById({ threadId: thread.id });
//       const updatedThread2 = await store.getThreadById({ threadId: thread2.id });

//       expect(new Date(updatedThread1!.updatedAt).getTime()).toBeGreaterThan(
//         new Date(initialThread1!.updatedAt).getTime(),
//       );
//       expect(new Date(updatedThread2!.updatedAt).getTime()).toBeGreaterThan(
//         new Date(initialThread2!.updatedAt).getTime(),
//       );

//       // Verify the message was moved
//       const thread1Messages = await store.getMessages({ threadId: thread.id, format: 'v2' });
//       const thread2Messages = await store.getMessages({ threadId: thread2.id, format: 'v2' });
//       expect(thread1Messages).toHaveLength(0);
//       expect(thread2Messages).toHaveLength(1);
//       expect(thread2Messages[0].id).toBe(message.id);
//     });
//     it('should upsert messages: duplicate id+threadId results in update, not duplicate row', async () => {
//       const thread = await createSampleThread();
//       await store.saveThread({ thread });
//       const baseMessage = createSampleMessageV2({
//         threadId: thread.id,
//         createdAt: new Date(),
//         content: { content: 'Original' },
//         resourceId: thread.resourceId,
//       });

//       // Insert the message for the first time
//       await store.saveMessages({ messages: [baseMessage], format: 'v2' });

//       // Insert again with the same id and threadId but different content
//       const updatedMessage = {
//         ...createSampleMessageV2({
//           threadId: thread.id,
//           createdAt: new Date(),
//           content: { content: 'Updated' },
//           resourceId: thread.resourceId,
//         }),
//         id: baseMessage.id,
//       };

//       await store.saveMessages({ messages: [updatedMessage], format: 'v2' });

//       // Retrieve messages for the thread
//       const retrievedMessages = await store.getMessages({ threadId: thread.id, format: 'v2' });

//       // Only one message should exist for that id+threadId
//       expect(retrievedMessages.filter(m => m.id === baseMessage.id)).toHaveLength(1);

//       // The content should be the updated one
//       expect(retrievedMessages.find(m => m.id === baseMessage.id)?.content.content).toBe('Updated');
//     });

//     it('should upsert messages: duplicate id and different threadid', async () => {
//       const thread1 = await createSampleThread();
//       const thread2 = await createSampleThread();
//       await store.saveThread({ thread: thread1 });
//       await store.saveThread({ thread: thread2 });

//       const message = createSampleMessageV2({
//         threadId: thread1.id,
//         createdAt: new Date(),
//         content: { content: 'Thread1 Content' },
//         resourceId: thread1.resourceId,
//       });

//       // Insert message into thread1
//       await store.saveMessages({ messages: [message], format: 'v2' });

//       // Attempt to insert a message with the same id but different threadId
//       const conflictingMessage = {
//         ...createSampleMessageV2({
//           threadId: thread2.id, // different thread
//           content: { content: 'Thread2 Content' },
//           resourceId: thread2.resourceId,
//         }),
//         id: message.id,
//       };

//       // Save should move the message to the new thread
//       await store.saveMessages({ messages: [conflictingMessage], format: 'v2' });

//       // Retrieve messages for both threads
//       const thread1Messages = await store.getMessages({ threadId: thread1.id, format: 'v2' });
//       const thread2Messages = await store.getMessages({ threadId: thread2.id, format: 'v2' });

//       // Thread 1 should NOT have the message with that id
//       expect(thread1Messages.find(m => m.id === message.id)).toBeUndefined();

//       // Thread 2 should have the message with that id
//       expect(thread2Messages.find(m => m.id === message.id)?.content.content).toBe('Thread2 Content');
//     });
//   });

//   describe('Edge Cases and Error Handling', () => {
//     it('should handle large metadata objects', async () => {
//       const thread = createSampleThread();
//       const largeMetadata = {
//         ...thread.metadata,
//         largeArray: Array.from({ length: 1000 }, (_, i) => ({ index: i, data: 'test'.repeat(100) })),
//       };

//       const threadWithLargeMetadata = {
//         ...thread,
//         metadata: largeMetadata,
//       };

//       await store.saveThread({ thread: threadWithLargeMetadata });
//       const retrieved = await store.getThreadById({ threadId: thread.id });

//       expect(retrieved?.metadata).toEqual(largeMetadata);
//     });

//     it('should handle special characters in thread titles', async () => {
//       const thread = {
//         ...createSampleThread(),
//         title: 'Special \'quotes\' and "double quotes" and emoji 🎉',
//       };

//       await store.saveThread({ thread });
//       const retrieved = await store.getThreadById({ threadId: thread.id });

//       expect(retrieved?.title).toBe(thread.title);
//     });

//     it('should handle concurrent thread updates', async () => {
//       const thread = createSampleThread();
//       await store.saveThread({ thread });

//       // Perform multiple updates concurrently
//       const updates = Array.from({ length: 5 }, (_, i) =>
//         store.updateThread({
//           id: thread.id,
//           title: `Update ${i}`,
//           metadata: { update: i },
//         }),
//       );

//       await expect(Promise.all(updates)).resolves.toBeDefined();

//       // Verify final state
//       const finalThread = await store.getThreadById({ threadId: thread.id });
//       expect(finalThread).toBeDefined();
//     });
//   });

//   describe('Eval Operations', () => {
//     it('should retrieve evals by agent name', async () => {
//       const agentName = `test-agent-${randomUUID()}`;

//       // Create sample evals using the imported helper
//       const liveEval = createSampleEval(agentName, false); // createSampleEval returns snake_case
//       const testEval = createSampleEval(agentName, true);
//       const otherAgentEval = createSampleEval(`other-agent-${randomUUID()}`, false);

//       // Insert evals - ensure DB columns are snake_case
//       await store.insert({
//         tableName: TABLE_EVALS,
//         record: {
//           agent_name: liveEval.agent_name, // Use snake_case
//           input: liveEval.input,
//           output: liveEval.output,
//           result: liveEval.result,
//           metric_name: liveEval.metric_name, // Use snake_case
//           instructions: liveEval.instructions,
//           test_info: liveEval.test_info, // test_info from helper can be undefined or object
//           global_run_id: liveEval.global_run_id, // Use snake_case
//           run_id: liveEval.run_id, // Use snake_case
//           created_at: new Date(liveEval.created_at as string), // created_at from helper is string or Date
//         },
//       });

//       await store.insert({
//         tableName: TABLE_EVALS,
//         record: {
//           agent_name: testEval.agent_name,
//           input: testEval.input,
//           output: testEval.output,
//           result: testEval.result,
//           metric_name: testEval.metric_name,
//           instructions: testEval.instructions,
//           test_info: testEval.test_info ? JSON.stringify(testEval.test_info) : null,
//           global_run_id: testEval.global_run_id,
//           run_id: testEval.run_id,
//           created_at: new Date(testEval.created_at as string),
//         },
//       });

//       await store.insert({
//         tableName: TABLE_EVALS,
//         record: {
//           agent_name: otherAgentEval.agent_name,
//           input: otherAgentEval.input,
//           output: otherAgentEval.output,
//           result: otherAgentEval.result,
//           metric_name: otherAgentEval.metric_name,
//           instructions: otherAgentEval.instructions,
//           test_info: otherAgentEval.test_info, // Can be null/undefined directly
//           global_run_id: otherAgentEval.global_run_id,
//           run_id: otherAgentEval.run_id,
//           created_at: new Date(otherAgentEval.created_at as string),
//         },
//       });

//       // Test getting all evals for the agent
//       const allEvals = await store.getEvalsByAgentName(agentName);
//       expect(allEvals).toHaveLength(2);
//       // EvalRow type expects camelCase, but PostgresStore.transformEvalRow converts snake_case from DB to camelCase
//       expect(allEvals.map(e => e.runId)).toEqual(expect.arrayContaining([liveEval.run_id, testEval.run_id]));

//       // Test getting only live evals
//       const liveEvals = await store.getEvalsByAgentName(agentName, 'live');
//       expect(liveEvals).toHaveLength(1);
//       expect(liveEvals[0].runId).toBe(liveEval.run_id); // Comparing with snake_case run_id from original data

//       // Test getting only test evals
//       const testEvalsResult = await store.getEvalsByAgentName(agentName, 'test');
//       expect(testEvalsResult).toHaveLength(1);
//       expect(testEvalsResult[0].runId).toBe(testEval.run_id);
//       expect(testEvalsResult[0].testInfo).toEqual(testEval.test_info);

//       // Test getting evals for non-existent agent
//       const nonExistentEvals = await store.getEvalsByAgentName('non-existent-agent');
//       expect(nonExistentEvals).toHaveLength(0);
//     });
//   });


//   describe('Schema Support', () => {
//     const customSchema = 'mastraTest';
//     let customSchemaStore: PostgresStore;

//     beforeAll(async () => {
//       customSchemaStore = new PostgresStore({
//         ...TEST_CONFIG,
//         schemaName: customSchema,
//       });

//       await customSchemaStore.init();
//     });

//     afterAll(async () => {
//       await customSchemaStore.close();
//       // Re-initialize the main store for subsequent tests
//       store = new PostgresStore(TEST_CONFIG);
//       await store.init();
//     });

//     describe('Constructor and Initialization', () => {
//       it('should accept connectionString directly', () => {
//         // Use existing store instead of creating new one
//         expect(store).toBeInstanceOf(PostgresStore);
//       });

//       it('should accept config object with schema', () => {
//         // Use existing custom schema store
//         expect(customSchemaStore).toBeInstanceOf(PostgresStore);
//       });
//     });

//     describe('Schema Operations', () => {
//       it('should create and query tables in custom schema', async () => {
//         // Create thread in custom schema
//         const thread = createSampleThread();
//         await customSchemaStore.saveThread({ thread });

//         // Verify thread exists in custom schema
//         const retrieved = await customSchemaStore.getThreadById({ threadId: thread.id });
//         expect(retrieved?.title).toBe(thread.title);
//       });

//       it('should allow same table names in different schemas', async () => {
//         // Create threads in both schemas
//         const defaultThread = createSampleThread();
//         const customThread = createSampleThread();

//         await store.saveThread({ thread: defaultThread });
//         await customSchemaStore.saveThread({ thread: customThread });

//         // Verify threads exist in respective schemas
//         const defaultResult = await store.getThreadById({ threadId: defaultThread.id });
//         const customResult = await customSchemaStore.getThreadById({ threadId: customThread.id });

//         expect(defaultResult?.id).toBe(defaultThread.id);
//         expect(customResult?.id).toBe(customThread.id);

//         // Verify cross-schema isolation
//         const defaultInCustom = await customSchemaStore.getThreadById({ threadId: defaultThread.id });
//         const customInDefault = await store.getThreadById({ threadId: customThread.id });

//         expect(defaultInCustom).toBeNull();
//         expect(customInDefault).toBeNull();
//       });
//     });
//   });

//   describe('Pagination Features', () => {
//     beforeEach(async () => {
//       await store.clearTable({ tableName: TABLE_EVALS });
//       await store.clearTable({ tableName: TABLE_TRACES });
//       await store.clearTable({ tableName: TABLE_MESSAGES });
//       await store.clearTable({ tableName: TABLE_THREADS });
//     });

//     describe('getEvals with pagination', () => {
//       it('should return paginated evals with total count (page/perPage)', async () => {
//         const agentName = 'pagination-agent-evals';
//         const evalPromises = Array.from({ length: 25 }, (_, i) => {
//           const evalData = createSampleEval(agentName, i % 2 === 0);
//           return store.insert({
//             tableName: TABLE_EVALS,
//             record: {
//               run_id: evalData.run_id,
//               agent_name: evalData.agent_name,
//               input: evalData.input,
//               output: evalData.output,
//               result: evalData.result,
//               metric_name: evalData.metric_name,
//               instructions: evalData.instructions,
//               test_info: evalData.test_info,
//               global_run_id: evalData.global_run_id,
//               created_at: new Date(evalData.created_at as string),
//             },
//           });
//         });
//         await Promise.all(evalPromises);

//         const page1 = await store.getEvals({ agentName, page: 0, perPage: 10 });
//         expect(page1.evals).toHaveLength(10);
//         expect(page1.total).toBe(25);
//         expect(page1.page).toBe(0);
//         expect(page1.perPage).toBe(10);
//         expect(page1.hasMore).toBe(true);

//         const page3 = await store.getEvals({ agentName, page: 2, perPage: 10 });
//         expect(page3.evals).toHaveLength(5);
//         expect(page3.total).toBe(25);
//         expect(page3.page).toBe(2);
//         expect(page3.hasMore).toBe(false);
//       });

//       it('should support limit/offset pagination for getEvals', async () => {
//         const agentName = 'pagination-agent-lo-evals';
//         const evalPromises = Array.from({ length: 15 }, () => {
//           const evalData = createSampleEval(agentName);
//           return store.insert({
//             tableName: TABLE_EVALS,
//             record: {
//               run_id: evalData.run_id,
//               agent_name: evalData.agent_name,
//               input: evalData.input,
//               output: evalData.output,
//               result: evalData.result,
//               metric_name: evalData.metric_name,
//               instructions: evalData.instructions,
//               test_info: evalData.test_info,
//               global_run_id: evalData.global_run_id,
//               created_at: new Date(evalData.created_at as string),
//             },
//           });
//         });
//         await Promise.all(evalPromises);

//         const result = await store.getEvals({ agentName, perPage: 5, page: 2 });
//         expect(result.evals).toHaveLength(5);
//         expect(result.total).toBe(15);
//         expect(result.page).toBe(2);
//         expect(result.perPage).toBe(5);
//         expect(result.hasMore).toBe(false);
//       });

//       it('should filter by type with pagination for getEvals', async () => {
//         const agentName = 'pagination-agent-type-evals';
//         const testEvalPromises = Array.from({ length: 10 }, () => {
//           const evalData = createSampleEval(agentName, true);
//           return store.insert({
//             tableName: TABLE_EVALS,
//             record: {
//               run_id: evalData.run_id,
//               agent_name: evalData.agent_name,
//               input: evalData.input,
//               output: evalData.output,
//               result: evalData.result,
//               metric_name: evalData.metric_name,
//               instructions: evalData.instructions,
//               test_info: evalData.test_info,
//               global_run_id: evalData.global_run_id,
//               created_at: new Date(evalData.created_at as string),
//             },
//           });
//         });
//         const liveEvalPromises = Array.from({ length: 8 }, () => {
//           const evalData = createSampleEval(agentName, false);
//           return store.insert({
//             tableName: TABLE_EVALS,
//             record: {
//               run_id: evalData.run_id,
//               agent_name: evalData.agent_name,
//               input: evalData.input,
//               output: evalData.output,
//               result: evalData.result,
//               metric_name: evalData.metric_name,
//               instructions: evalData.instructions,
//               test_info: evalData.test_info,
//               global_run_id: evalData.global_run_id,
//               created_at: new Date(evalData.created_at as string),
//             },
//           });
//         });
//         await Promise.all([...testEvalPromises, ...liveEvalPromises]);

//         const testResults = await store.getEvals({ agentName, type: 'test', page: 0, perPage: 5 });
//         expect(testResults.evals).toHaveLength(5);
//         expect(testResults.total).toBe(10);

//         const liveResults = await store.getEvals({ agentName, type: 'live', page: 1, perPage: 3 });
//         expect(liveResults.evals).toHaveLength(3);
//         expect(liveResults.total).toBe(8);
//         expect(liveResults.hasMore).toBe(true);
//       });

//       it('should filter by date with pagination for getEvals', async () => {
//         const agentName = 'pagination-agent-date-evals';
//         const now = new Date();
//         const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//         const dayBeforeYesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);

//         const createEvalAtDate = (date: Date) => {
//           const evalData = createSampleEval(agentName, false, date); // Pass date to helper
//           return store.insert({
//             tableName: TABLE_EVALS,
//             record: {
//               run_id: evalData.run_id, // Use snake_case from helper
//               agent_name: evalData.agent_name,
//               input: evalData.input,
//               output: evalData.output,
//               result: evalData.result,
//               metric_name: evalData.metric_name,
//               instructions: evalData.instructions,
//               test_info: evalData.test_info,
//               global_run_id: evalData.global_run_id,
//               created_at: evalData.created_at, // Use created_at from helper (already Date or ISO string)
//             },
//           });
//         };

//         await Promise.all([
//           createEvalAtDate(dayBeforeYesterday),
//           createEvalAtDate(dayBeforeYesterday),
//           createEvalAtDate(yesterday),
//           createEvalAtDate(yesterday),
//           createEvalAtDate(yesterday),
//           createEvalAtDate(now),
//           createEvalAtDate(now),
//           createEvalAtDate(now),
//           createEvalAtDate(now),
//         ]);

//         const fromYesterday = await store.getEvals({ agentName, dateRange: { start: yesterday }, page: 0, perPage: 3 });
//         expect(fromYesterday.total).toBe(7); // 3 yesterday + 4 now
//         expect(fromYesterday.evals).toHaveLength(3);
//         // Evals are sorted DESC, so first 3 are from 'now'
//         fromYesterday.evals.forEach(e =>
//           expect(new Date(e.createdAt).getTime()).toBeGreaterThanOrEqual(yesterday.getTime()),
//         );

//         const onlyDayBefore = await store.getEvals({
//           agentName,
//           dateRange: {
//             end: new Date(yesterday.getTime() - 1),
//           },
//           page: 0,
//           perPage: 5,
//         });
//         expect(onlyDayBefore.total).toBe(2);
//         expect(onlyDayBefore.evals).toHaveLength(2);
//       });
//     });

//     describe('getTraces with pagination', () => {
//       it('should return paginated traces with total count', async () => {
//         const tracePromises = Array.from({ length: 18 }, (_, i) =>
//           store.insert({ tableName: TABLE_TRACES, record: createSampleTraceForDB(`test-trace-${i}`, 'pg-test-scope') }),
//         );
//         await Promise.all(tracePromises);

//         const page1 = await store.getTracesPaginated({
//           scope: 'pg-test-scope',
//           page: 0,
//           perPage: 8,
//         });
//         expect(page1.traces).toHaveLength(8);
//         expect(page1.total).toBe(18);
//         expect(page1.page).toBe(0);
//         expect(page1.perPage).toBe(8);
//         expect(page1.hasMore).toBe(true);

//         const page3 = await store.getTracesPaginated({
//           scope: 'pg-test-scope',
//           page: 2,
//           perPage: 8,
//         });
//         expect(page3.traces).toHaveLength(2);
//         expect(page3.total).toBe(18);
//         expect(page3.hasMore).toBe(false);
//       });

//       it('should filter by attributes with pagination for getTraces', async () => {
//         const tracesWithAttr = Array.from({ length: 8 }, (_, i) =>
//           store.insert({
//             tableName: TABLE_TRACES,
//             record: createSampleTraceForDB(`trace-${i}`, 'pg-attr-scope', { environment: 'prod' }),
//           }),
//         );
//         const tracesWithoutAttr = Array.from({ length: 5 }, (_, i) =>
//           store.insert({
//             tableName: TABLE_TRACES,
//             record: createSampleTraceForDB(`trace-other-${i}`, 'pg-attr-scope', { environment: 'dev' }),
//           }),
//         );
//         await Promise.all([...tracesWithAttr, ...tracesWithoutAttr]);

//         const prodTraces = await store.getTracesPaginated({
//           scope: 'pg-attr-scope',
//           attributes: { environment: 'prod' },
//           page: 0,
//           perPage: 5,
//         });
//         expect(prodTraces.traces).toHaveLength(5);
//         expect(prodTraces.total).toBe(8);
//         expect(prodTraces.hasMore).toBe(true);
//       });

//       it('should filter by date with pagination for getTraces', async () => {
//         const scope = 'pg-date-traces';
//         const now = new Date();
//         const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//         const dayBeforeYesterday = new Date(now.getTime() - 48 * 60 * 60 * 1000);

//         await Promise.all([
//           store.insert({
//             tableName: TABLE_TRACES,
//             record: createSampleTraceForDB('t1', scope, undefined, dayBeforeYesterday),
//           }),
//           store.insert({ tableName: TABLE_TRACES, record: createSampleTraceForDB('t2', scope, undefined, yesterday) }),
//           store.insert({ tableName: TABLE_TRACES, record: createSampleTraceForDB('t3', scope, undefined, yesterday) }),
//           store.insert({ tableName: TABLE_TRACES, record: createSampleTraceForDB('t4', scope, undefined, now) }),
//           store.insert({ tableName: TABLE_TRACES, record: createSampleTraceForDB('t5', scope, undefined, now) }),
//         ]);

//         const fromYesterday = await store.getTracesPaginated({
//           scope,
//           dateRange: {
//             start: yesterday,
//           },
//           page: 0,
//           perPage: 2,
//         });
//         expect(fromYesterday.total).toBe(4); // 2 yesterday + 2 now
//         expect(fromYesterday.traces).toHaveLength(2);
//         fromYesterday.traces.forEach(t =>
//           expect(new Date(t.createdAt).getTime()).toBeGreaterThanOrEqual(yesterday.getTime()),
//         );

//         const onlyNow = await store.getTracesPaginated({
//           scope,
//           dateRange: {
//             start: now,
//             end: now,
//           },
//           page: 0,
//           perPage: 5,
//         });
//         expect(onlyNow.total).toBe(2);
//         expect(onlyNow.traces).toHaveLength(2);
//       });
//     });

//     describe('getThreadsByResourceId with pagination', () => {
//       it('should return paginated threads with total count', async () => {
//         const resourceId = `pg-paginated-resource-${randomUUID()}`;
//         const threadPromises = Array.from({ length: 17 }, () =>
//           store.saveThread({ thread: { ...createSampleThread(), resourceId } }),
//         );
//         await Promise.all(threadPromises);

//         const page1 = await store.getThreadsByResourceIdPaginated({ resourceId, page: 0, perPage: 7 });
//         expect(page1.threads).toHaveLength(7);
//         expect(page1.total).toBe(17);
//         expect(page1.page).toBe(0);
//         expect(page1.perPage).toBe(7);
//         expect(page1.hasMore).toBe(true);

//         const page3 = await store.getThreadsByResourceIdPaginated({ resourceId, page: 2, perPage: 7 });
//         expect(page3.threads).toHaveLength(3); // 17 total, 7 per page, 3rd page has 17 - 2*7 = 3
//         expect(page3.total).toBe(17);
//         expect(page3.hasMore).toBe(false);
//       });

//       it('should return paginated results when no pagination params for getThreadsByResourceId', async () => {
//         const resourceId = `pg-non-paginated-resource-${randomUUID()}`;
//         await store.saveThread({ thread: { ...createSampleThread(), resourceId } });

//         const results = await store.getThreadsByResourceIdPaginated({ resourceId });
//         expect(Array.isArray(results.threads)).toBe(true);
//         expect(results.threads.length).toBe(1);
//         expect(results.total).toBe(1);
//         expect(results.page).toBe(0);
//         expect(results.perPage).toBe(100);
//         expect(results.hasMore).toBe(false);
//       });
//     });
//   });

//   describe('PgStorage Table Name Quoting', () => {
//     const camelCaseTable = 'TestCamelCaseTable';
//     const snakeCaseTable = 'test_snake_case_table';
//     const BASE_SCHEMA = {
//       id: { type: 'integer', primaryKey: true, nullable: false },
//       name: { type: 'text', nullable: true },
//     } as Record<string, StorageColumn>;

//     beforeEach(async () => {
//       // Only clear tables if store is initialized
//       try {
//         // Clear tables before each test
//         await store.clearTable({ tableName: camelCaseTable as TABLE_NAMES });
//         await store.clearTable({ tableName: snakeCaseTable as TABLE_NAMES });
//       } catch (error) {
//         // Ignore errors during table clearing
//         console.warn('Error clearing tables:', error);
//       }
//     });

//     afterEach(async () => {
//       // Only clear tables if store is initialized
//       try {
//         // Clear tables before each test
//         await store.clearTable({ tableName: camelCaseTable as TABLE_NAMES });
//         await store.clearTable({ tableName: snakeCaseTable as TABLE_NAMES });
//       } catch (error) {
//         // Ignore errors during table clearing
//         console.warn('Error clearing tables:', error);
//       }
//     });

//     it('should create and upsert to a camelCase table without quoting errors', async () => {
//       await expect(
//         store.createTable({
//           tableName: camelCaseTable as TABLE_NAMES,
//           schema: BASE_SCHEMA,
//         }),
//       ).resolves.not.toThrow();

//       await store.insert({
//         tableName: camelCaseTable as TABLE_NAMES,
//         record: { id: '1', name: 'Alice' },
//       });

//       const row: any = await store.load({
//         tableName: camelCaseTable as TABLE_NAMES,
//         keys: { id: '1' },
//       });
//       expect(row?.name).toBe('Alice');
//     });

//     it('should create and upsert to a snake_case table without quoting errors', async () => {
//       await expect(
//         store.createTable({
//           tableName: snakeCaseTable as TABLE_NAMES,
//           schema: BASE_SCHEMA,
//         }),
//       ).resolves.not.toThrow();

//       await store.insert({
//         tableName: snakeCaseTable as TABLE_NAMES,
//         record: { id: '2', name: 'Bob' },
//       });

//       const row: any = await store.load({
//         tableName: snakeCaseTable as TABLE_NAMES,
//         keys: { id: '2' },
//       });
//       expect(row?.name).toBe('Bob');
//     });
//   });

//   describe('Permission Handling', () => {
//     const schemaRestrictedUser = 'mastra_schema_restricted_storage';
//     const restrictedPassword = 'test123';
//     const testSchema = 'testSchema';
//     let adminDb: pgPromise.IDatabase<{}>;
//     let pgpAdmin: pgPromise.IMain;

//     beforeAll(async () => {
//       // Create a separate pg-promise instance for admin operations
//       pgpAdmin = pgPromise();
//       adminDb = pgpAdmin(connectionString);
//       try {
//         await adminDb.tx(async t => {
//           // Drop the test schema if it exists from previous runs
//           await t.none(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);

//           // Create schema restricted user with minimal permissions
//           await t.none(`          
//           DO $$
//           BEGIN
//             IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${schemaRestrictedUser}') THEN
//               CREATE USER ${schemaRestrictedUser} WITH PASSWORD '${restrictedPassword}' NOCREATEDB;
//             END IF;
//           END
//           $$;`);

//           // Grant only connect and usage to schema restricted user
//           await t.none(`
//             REVOKE ALL ON DATABASE ${TEST_CONFIG.database} FROM ${schemaRestrictedUser};
//             GRANT CONNECT ON DATABASE ${TEST_CONFIG.database} TO ${schemaRestrictedUser};
//             REVOKE ALL ON SCHEMA public FROM ${schemaRestrictedUser};
//             GRANT USAGE ON SCHEMA public TO ${schemaRestrictedUser};
//           `);
//         });
//       } catch (error) {
//         // Clean up the database connection on error
//         pgpAdmin.end();
//         throw error;
//       }
//     });

//     afterAll(async () => {
//       try {
//         // First close any store connections
//         if (store) {
//           await store.close();
//         }

//         // Then clean up test user in admin connection
//         await adminDb.tx(async t => {
//           await t.none(`
//             REASSIGN OWNED BY ${schemaRestrictedUser} TO postgres;
//             DROP OWNED BY ${schemaRestrictedUser};
//             DROP USER IF EXISTS ${schemaRestrictedUser};
//           `);
//         });

//         // Finally clean up admin connection
//         if (pgpAdmin) {
//           pgpAdmin.end();
//         }
//       } catch (error) {
//         console.error('Error cleaning up test user:', error);
//         // Still try to clean up connections even if user cleanup fails
//         if (store) await store.close();
//         if (pgpAdmin) pgpAdmin.end();
//       }
//     });

//     describe('Schema Creation', () => {
//       beforeEach(async () => {
//         // Create a fresh connection for each test
//         const tempPgp = pgPromise();
//         const tempDb = tempPgp(connectionString);

//         try {
//           // Ensure schema doesn't exist before each test
//           await tempDb.none(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);

//           // Ensure no active connections from restricted user
//           await tempDb.none(`
//             SELECT pg_terminate_backend(pid) 
//             FROM pg_stat_activity 
//             WHERE usename = '${schemaRestrictedUser}'
//           `);
//         } finally {
//           tempPgp.end(); // Always clean up the connection
//         }
//       });

//       afterEach(async () => {
//         // Create a fresh connection for cleanup
//         const tempPgp = pgPromise();
//         const tempDb = tempPgp(connectionString);

//         try {
//           // Clean up any connections from the restricted user and drop schema
//           await tempDb.none(`
//             DO $$
//             BEGIN
//               -- Terminate connections
//               PERFORM pg_terminate_backend(pid) 
//               FROM pg_stat_activity 
//               WHERE usename = '${schemaRestrictedUser}';

//               -- Drop schema
//               DROP SCHEMA IF EXISTS ${testSchema} CASCADE;
//             END $$;
//           `);
//         } catch (error) {
//           console.error('Error in afterEach cleanup:', error);
//         } finally {
//           tempPgp.end(); // Always clean up the connection
//         }
//       });

//       it('should fail when user lacks CREATE privilege', async () => {
//         const restrictedDB = new PostgresStore({
//           ...TEST_CONFIG,
//           user: schemaRestrictedUser,
//           password: restrictedPassword,
//           schemaName: testSchema,
//         });

//         // Create a fresh connection for verification
//         const tempPgp = pgPromise();
//         const tempDb = tempPgp(connectionString);

//         try {
//           // Test schema creation by initializing the store
//           await expect(async () => {
//             await restrictedDB.init();
//           }).rejects.toThrow(
//             `Unable to create schema "${testSchema}". This requires CREATE privilege on the database.`,
//           );

//           // Verify schema was not created
//           const exists = await tempDb.oneOrNone(
//             `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)`,
//             [testSchema],
//           );
//           expect(exists?.exists).toBe(false);
//         } finally {
//           await restrictedDB.close();
//           tempPgp.end(); // Clean up the verification connection
//         }
//       });

//       it('should fail with schema creation error when saving thread', async () => {
//         const restrictedDB = new PostgresStore({
//           ...TEST_CONFIG,
//           user: schemaRestrictedUser,
//           password: restrictedPassword,
//           schemaName: testSchema,
//         });

//         // Create a fresh connection for verification
//         const tempPgp = pgPromise();
//         const tempDb = tempPgp(connectionString);

//         try {
//           await expect(async () => {
//             await restrictedDB.init();
//             const thread = createSampleThread();
//             await restrictedDB.saveThread({ thread });
//           }).rejects.toThrow(
//             `Unable to create schema "${testSchema}". This requires CREATE privilege on the database.`,
//           );

//           // Verify schema was not created
//           const exists = await tempDb.oneOrNone(
//             `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)`,
//             [testSchema],
//           );
//           expect(exists?.exists).toBe(false);
//         } finally {
//           await restrictedDB.close();
//           tempPgp.end(); // Clean up the verification connection
//         }
//       });
//     });
//   });

//   afterAll(async () => {
//     try {
//       await store.close();
//     } catch (error) {
//       console.warn('Error closing store:', error);
//     }
//   });
// });
