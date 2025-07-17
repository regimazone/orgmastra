import {
  createTestSuite,
} from '@internal/storage-test-utils';
import { vi } from 'vitest';
import { UpstashStore } from './index';

// Increase timeout for all tests in this file to 30 seconds
vi.setConfig({ testTimeout: 200_000, hookTimeout: 200_000 });

createTestSuite(new UpstashStore({
  url: 'http://localhost:8079',
  token: 'test_token',
}))

// const createSampleTrace = (
//   name: string,
//   scope?: string,
//   attributes?: Record<string, string>,
//   createdAt: Date = new Date(),
// ) => ({
//   id: `trace-${randomUUID()}`,
//   parentSpanId: `span-${randomUUID()}`,
//   traceId: `trace-${randomUUID()}`,
//   name,
//   scope,
//   kind: 'internal',
//   status: JSON.stringify({ code: 'success' }),
//   events: JSON.stringify([{ name: 'start', timestamp: createdAt.getTime() }]),
//   links: JSON.stringify([]),
//   attributes: attributes ? JSON.stringify(attributes) : undefined,
//   startTime: createdAt.toISOString(),
//   endTime: new Date(createdAt.getTime() + 1000).toISOString(),
//   other: JSON.stringify({ custom: 'data' }),
//   createdAt: createdAt.toISOString(),
// });

// const createSampleEval = (agentName: string, isTest = false, createdAt: Date = new Date()) => {
//   const testInfo = isTest ? { testPath: 'test/path.ts', testName: 'Test Name' } : undefined;

//   return {
//     agent_name: agentName,
//     input: 'Sample input',
//     output: 'Sample output',
//     result: JSON.stringify({ score: 0.8 }),
//     metric_name: 'sample-metric',
//     instructions: 'Sample instructions',
//     test_info: testInfo ? JSON.stringify(testInfo) : undefined,
//     global_run_id: `global-${randomUUID()}`,
//     run_id: `run-${randomUUID()}`,
//     created_at: createdAt.toISOString(),
//   };
// };

// describe('UpstashStore', () => {
//   let store: UpstashStore;
//   const testTableName = 'test_table';
//   const testTableName2 = 'test_table2';

//   beforeAll(async () => {
//     console.log('Initializing UpstashStore...');

//     await new Promise(resolve => setTimeout(resolve, 5000));
//     store = new UpstashStore({
//       url: 'http://localhost:8079',
//       token: 'test_token',
//     });

//     await store.init();
//     console.log('UpstashStore initialized');
//   });

//   afterAll(async () => {
//     // Clean up test tables
//     await store.clearTable({ tableName: testTableName as TABLE_NAMES });
//     await store.clearTable({ tableName: testTableName2 as TABLE_NAMES });
//     await store.clearTable({ tableName: TABLE_THREADS });
//     await store.clearTable({ tableName: TABLE_MESSAGES });
//     await store.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
//     await store.clearTable({ tableName: TABLE_EVALS });
//     await store.clearTable({ tableName: TABLE_TRACES });
//   });




//   describe('getWorkflowRuns', () => {
//     const testNamespace = 'test-namespace';
//     beforeEach(async () => {
//       await store.clearTable({ tableName: TABLE_WORKFLOW_SNAPSHOT });
//     });
//     it('returns empty array when no workflows exist', async () => {
//       const { runs, total } = await store.getWorkflowRuns();
//       expect(runs).toEqual([]);
//       expect(total).toBe(0);
//     });

//     it('returns all workflows by default', async () => {
//       const workflowName1 = 'default_test_1';
//       const workflowName2 = 'default_test_2';

//       const { snapshot: workflow1, runId: runId1, stepId: stepId1 } = createSampleWorkflowSnapshot('success');
//       const { snapshot: workflow2, runId: runId2, stepId: stepId2 } = createSampleWorkflowSnapshot('waiting');

//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName1,
//         runId: runId1,
//         snapshot: workflow1,
//       });
//       await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName2,
//         runId: runId2,
//         snapshot: workflow2,
//       });

//       const { runs, total } = await store.getWorkflowRuns({ namespace: testNamespace });
//       expect(runs).toHaveLength(2);
//       expect(total).toBe(2);
//       expect(runs[0]!.workflowName).toBe(workflowName2); // Most recent first
//       expect(runs[1]!.workflowName).toBe(workflowName1);
//       const firstSnapshot = runs[0]!.snapshot;
//       const secondSnapshot = runs[1]!.snapshot;
//       checkWorkflowSnapshot(firstSnapshot, stepId2, 'waiting');
//       checkWorkflowSnapshot(secondSnapshot, stepId1, 'success');
//     });

//     it('filters by workflow name', async () => {
//       const workflowName1 = 'filter_test_1';
//       const workflowName2 = 'filter_test_2';

//       const { snapshot: workflow1, runId: runId1, stepId: stepId1 } = createSampleWorkflowSnapshot('success');
//       const { snapshot: workflow2, runId: runId2 } = createSampleWorkflowSnapshot('failed');

//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName1,
//         runId: runId1,
//         snapshot: workflow1,
//       });
//       await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName2,
//         runId: runId2,
//         snapshot: workflow2,
//       });

//       const { runs, total } = await store.getWorkflowRuns({ namespace: testNamespace, workflowName: workflowName1 });
//       expect(runs).toHaveLength(1);
//       expect(total).toBe(1);
//       expect(runs[0]!.workflowName).toBe(workflowName1);
//       const snapshot = runs[0]!.snapshot;
//       checkWorkflowSnapshot(snapshot, stepId1, 'success');
//     });

//     it('filters by date range', async () => {
//       const now = new Date();
//       const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//       const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
//       const workflowName1 = 'date_test_1';
//       const workflowName2 = 'date_test_2';
//       const workflowName3 = 'date_test_3';

//       const { snapshot: workflow1, runId: runId1 } = createSampleWorkflowSnapshot('success');
//       const { snapshot: workflow2, runId: runId2, stepId: stepId2 } = createSampleWorkflowSnapshot('waiting');
//       const { snapshot: workflow3, runId: runId3, stepId: stepId3 } = createSampleWorkflowSnapshot('skipped');

//       await store.insert({
//         tableName: TABLE_WORKFLOW_SNAPSHOT,
//         record: {
//           namespace: testNamespace,
//           workflow_name: workflowName1,
//           run_id: runId1,
//           snapshot: workflow1,
//           createdAt: twoDaysAgo,
//           updatedAt: twoDaysAgo,
//         },
//       });
//       await store.insert({
//         tableName: TABLE_WORKFLOW_SNAPSHOT,
//         record: {
//           namespace: testNamespace,
//           workflow_name: workflowName2,
//           run_id: runId2,
//           snapshot: workflow2,
//           createdAt: yesterday,
//           updatedAt: yesterday,
//         },
//       });
//       await store.insert({
//         tableName: TABLE_WORKFLOW_SNAPSHOT,
//         record: {
//           namespace: testNamespace,
//           workflow_name: workflowName3,
//           run_id: runId3,
//           snapshot: workflow3,
//           createdAt: now,
//           updatedAt: now,
//         },
//       });

//       const { runs } = await store.getWorkflowRuns({
//         namespace: testNamespace,
//         fromDate: yesterday,
//         toDate: now,
//       });

//       expect(runs).toHaveLength(2);
//       expect(runs[0]!.workflowName).toBe(workflowName3);
//       expect(runs[1]!.workflowName).toBe(workflowName2);
//       const firstSnapshot = runs[0]!.snapshot;
//       const secondSnapshot = runs[1]!.snapshot;
//       checkWorkflowSnapshot(firstSnapshot, stepId3, 'skipped');
//       checkWorkflowSnapshot(secondSnapshot, stepId2, 'waiting');
//     });

//     it('handles pagination', async () => {
//       const workflowName1 = 'page_test_1';
//       const workflowName2 = 'page_test_2';
//       const workflowName3 = 'page_test_3';

//       const { snapshot: workflow1, runId: runId1, stepId: stepId1 } = createSampleWorkflowSnapshot('success');
//       const { snapshot: workflow2, runId: runId2, stepId: stepId2 } = createSampleWorkflowSnapshot('waiting');
//       const { snapshot: workflow3, runId: runId3, stepId: stepId3 } = createSampleWorkflowSnapshot('skipped');

//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName1,
//         runId: runId1,
//         snapshot: workflow1,
//       });
//       await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName2,
//         runId: runId2,
//         snapshot: workflow2,
//       });
//       await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
//       await store.persistWorkflowSnapshot({
//         namespace: testNamespace,
//         workflowName: workflowName3,
//         runId: runId3,
//         snapshot: workflow3,
//       });

//       // Get first page
//       const page1 = await store.getWorkflowRuns({
//         namespace: testNamespace,
//         limit: 2,
//         offset: 0,
//       });
//       expect(page1.runs).toHaveLength(2);
//       expect(page1.total).toBe(3); // Total count of all records
//       expect(page1.runs[0]!.workflowName).toBe(workflowName3);
//       expect(page1.runs[1]!.workflowName).toBe(workflowName2);
//       const firstSnapshot = page1.runs[0]!.snapshot;
//       const secondSnapshot = page1.runs[1]!.snapshot;
//       checkWorkflowSnapshot(firstSnapshot, stepId3, 'skipped');
//       checkWorkflowSnapshot(secondSnapshot, stepId2, 'waiting');

//       // Get second page
//       const page2 = await store.getWorkflowRuns({
//         namespace: testNamespace,
//         limit: 2,
//         offset: 2,
//       });
//       expect(page2.runs).toHaveLength(1);
//       expect(page2.total).toBe(3);
//       expect(page2.runs[0]!.workflowName).toBe(workflowName1);
//       const snapshot = page2.runs[0]!.snapshot;
//       checkWorkflowSnapshot(snapshot, stepId1, 'success');
//     });
//   });
//   describe('getWorkflowRunById', () => {
//     const testNamespace = 'test-workflows-id';
//     const workflowName = 'workflow-id-test';
//     let runId: string;
//     let stepId: string;

//     beforeAll(async () => {
//       // Insert a workflow run for positive test
//       const sample = createSampleWorkflowSnapshot('success');
//       runId = sample.runId;
//       stepId = sample.stepId;
//       await store.insert({
//         tableName: TABLE_WORKFLOW_SNAPSHOT,
//         record: {
//           namespace: testNamespace,
//           workflow_name: workflowName,
//           run_id: runId,
//           resourceId: 'resource-abc',
//           snapshot: sample.snapshot,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//         },
//       });
//     });

//     it('should retrieve a workflow run by ID', async () => {
//       const found = await store.getWorkflowRunById({
//         namespace: testNamespace,
//         runId,
//         workflowName,
//       });
//       expect(found).not.toBeNull();
//       expect(found?.runId).toBe(runId);
//       const snapshot = found?.snapshot;
//       checkWorkflowSnapshot(snapshot!, stepId, 'success');
//     });

//     it('should return null for non-existent workflow run ID', async () => {
//       const notFound = await store.getWorkflowRunById({
//         namespace: testNamespace,
//         runId: 'non-existent-id',
//         workflowName,
//       });
//       expect(notFound).toBeNull();
//     });
//   });
//   describe('getWorkflowRuns with resourceId', () => {
//     const testNamespace = 'test-workflows-id';
//     const workflowName = 'workflow-id-test';
//     let resourceId: string;
//     let runIds: string[] = [];

//     beforeAll(async () => {
//       // Insert multiple workflow runs for the same resourceId
//       resourceId = 'resource-shared';
//       for (const status of ['success', 'waiting']) {
//         const sample = createSampleWorkflowSnapshot(status);
//         runIds.push(sample.runId);
//         await store.insert({
//           tableName: TABLE_WORKFLOW_SNAPSHOT,
//           record: {
//             namespace: testNamespace,
//             workflow_name: workflowName,
//             run_id: sample.runId,
//             resourceId,
//             snapshot: sample.snapshot,
//             createdAt: new Date(),
//             updatedAt: new Date(),
//           },
//         });
//       }
//       // Insert a run with a different resourceId
//       const other = createSampleWorkflowSnapshot('waiting');
//       await store.insert({
//         tableName: TABLE_WORKFLOW_SNAPSHOT,
//         record: {
//           namespace: testNamespace,
//           workflow_name: workflowName,
//           run_id: other.runId,
//           resourceId: 'resource-other',
//           snapshot: other.snapshot,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//         },
//       });
//     });

//     it('should retrieve all workflow runs by resourceId', async () => {
//       const { runs } = await store.getWorkflowRuns({
//         namespace: testNamespace,
//         resourceId,
//         workflowName,
//       });
//       expect(Array.isArray(runs)).toBe(true);
//       expect(runs.length).toBeGreaterThanOrEqual(2);
//       for (const run of runs) {
//         expect(run.resourceId).toBe(resourceId);
//       }
//     });

//     it('should return an empty array if no workflow runs match resourceId', async () => {
//       const { runs } = await store.getWorkflowRuns({
//         namespace: testNamespace,
//         resourceId: 'non-existent-resource',
//         workflowName,
//       });
//       expect(Array.isArray(runs)).toBe(true);
//       expect(runs.length).toBe(0);
//     });
//   });

//   describe('alterTable (no-op/schemaless)', () => {
//     const TEST_TABLE = 'test_alter_table'; // Use "table" or "collection" as appropriate
//     beforeEach(async () => {
//       await store.clearTable({ tableName: TEST_TABLE as TABLE_NAMES });
//     });

//     afterEach(async () => {
//       await store.clearTable({ tableName: TEST_TABLE as TABLE_NAMES });
//     });

//     it('allows inserting records with new fields without alterTable', async () => {
//       await store.insert({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         record: { id: '1', name: 'Alice' },
//       });
//       await store.insert({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         record: { id: '2', name: 'Bob', newField: 123 },
//       });

//       const row = await store.load<{ id: string; name: string; newField?: number }>({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         keys: { id: '2' },
//       });
//       expect(row?.newField).toBe(123);
//     });

//     it('does not throw when calling alterTable (no-op)', async () => {
//       await expect(
//         store.alterTable({
//           tableName: TEST_TABLE as TABLE_NAMES,
//           schema: {
//             id: { type: 'text', primaryKey: true, nullable: false },
//             name: { type: 'text', nullable: true },
//             extra: { type: 'integer', nullable: true },
//           },
//           ifNotExists: [],
//         }),
//       ).resolves.not.toThrow();
//     });

//     it('can add multiple new fields at write time', async () => {
//       await store.insert({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         record: { id: '3', name: 'Charlie', age: 30, city: 'Paris' },
//       });
//       const row = await store.load<{ id: string; name: string; age?: number; city?: string }>({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         keys: { id: '3' },
//       });
//       expect(row?.age).toBe(30);
//       expect(row?.city).toBe('Paris');
//     });

//     it('can retrieve all fields, including dynamically added ones', async () => {
//       await store.insert({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         record: { id: '4', name: 'Dana', hobby: 'skiing' },
//       });
//       const row = await store.load<{ id: string; name: string; hobby?: string }>({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         keys: { id: '4' },
//       });
//       expect(row?.hobby).toBe('skiing');
//     });

//     it('does not restrict or error on arbitrary new fields', async () => {
//       await expect(
//         store.insert({
//           tableName: TEST_TABLE as TABLE_NAMES,
//           record: { id: '5', weirdField: { nested: true }, another: [1, 2, 3] },
//         }),
//       ).resolves.not.toThrow();

//       const row = await store.load<{ id: string; weirdField?: any; another?: any }>({
//         tableName: TEST_TABLE as TABLE_NAMES,
//         keys: { id: '5' },
//       });
//       expect(row?.weirdField).toEqual({ nested: true });
//       expect(row?.another).toEqual([1, 2, 3]);
//     });
//   });

//   describe('Pagination Features', () => {
//     beforeEach(async () => {
//       // Clear all test data
//       await store.clearTable({ tableName: TABLE_THREADS });
//       await store.clearTable({ tableName: TABLE_MESSAGES });
//       await store.clearTable({ tableName: TABLE_EVALS });
//       await store.clearTable({ tableName: TABLE_TRACES });
//     });

//     describe('getEvals with pagination', () => {
//       it('should return paginated evals with total count', async () => {
//         const agentName = 'test-agent';
//         const evals = Array.from({ length: 25 }, (_, i) => createSampleEval(agentName, i % 2 === 0));

//         // Insert all evals
//         for (const evalRecord of evals) {
//           await store.insert({
//             tableName: TABLE_EVALS,
//             record: evalRecord,
//           });
//         }

//         // Test page-based pagination
//         const page1 = await store.getEvals({ agentName, page: 0, perPage: 10 });
//         expect(page1.evals).toHaveLength(10);
//         expect(page1.total).toBe(25);
//         expect(page1.page).toBe(0);
//         expect(page1.perPage).toBe(10);
//         expect(page1.hasMore).toBe(true);

//         const page2 = await store.getEvals({ agentName, page: 1, perPage: 10 });
//         expect(page2.evals).toHaveLength(10);
//         expect(page2.total).toBe(25);
//         expect(page2.hasMore).toBe(true);

//         const page3 = await store.getEvals({ agentName, page: 2, perPage: 10 });
//         expect(page3.evals).toHaveLength(5);
//         expect(page3.total).toBe(25);
//         expect(page3.hasMore).toBe(false);
//       });

//       it('should support page/perPage pagination', async () => {
//         const agentName = 'test-agent-2';
//         const evals = Array.from({ length: 15 }, () => createSampleEval(agentName));

//         for (const evalRecord of evals) {
//           await store.insert({
//             tableName: TABLE_EVALS,
//             record: evalRecord,
//           });
//         }

//         // Test offset-based pagination
//         const result1 = await store.getEvals({ agentName, page: 0, perPage: 5 });
//         expect(result1.evals).toHaveLength(5);
//         expect(result1.total).toBe(15);
//         expect(result1.hasMore).toBe(true);

//         const result2 = await store.getEvals({ agentName, page: 2, perPage: 5 });
//         expect(result2.evals).toHaveLength(5);
//         expect(result2.total).toBe(15);
//         expect(result2.hasMore).toBe(false);
//       });

//       it('should filter by type with pagination', async () => {
//         const agentName = 'test-agent-3';
//         const testEvals = Array.from({ length: 10 }, () => createSampleEval(agentName, true));
//         const liveEvals = Array.from({ length: 8 }, () => createSampleEval(agentName, false));

//         for (const evalRecord of [...testEvals, ...liveEvals]) {
//           await store.insert({
//             tableName: TABLE_EVALS,
//             record: evalRecord,
//           });
//         }

//         const testResults = await store.getEvals({ agentName, type: 'test', page: 0, perPage: 5 });
//         expect(testResults.evals).toHaveLength(5);
//         expect(testResults.total).toBe(10);

//         const liveResults = await store.getEvals({ agentName, type: 'live', page: 0, perPage: 5 });
//         expect(liveResults.evals).toHaveLength(5);
//         expect(liveResults.total).toBe(8);
//       });

//       it('should filter by date with pagination', async () => {
//         const agentName = 'test-agent-date';
//         const now = new Date();
//         const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
//         const evals = [createSampleEval(agentName, false, now), createSampleEval(agentName, false, yesterday)];
//         for (const evalRecord of evals) {
//           await store.insert({
//             tableName: TABLE_EVALS,
//             record: evalRecord,
//           });
//         }
//         const result = await store.getEvals({
//           agentName,
//           page: 0,
//           perPage: 10,
//           dateRange: { start: now },
//         });
//         expect(result.evals).toHaveLength(1);
//         expect(result.total).toBe(1);
//       });
//     });


//     describe('Enhanced existing methods with pagination', () => {
//       it('should support pagination in getThreadsByResourceId', async () => {
//         const resourceId = 'enhanced-resource';
//         const threads = Array.from({ length: 17 }, () => createSampleThread({ resourceId }));

//         for (const thread of threads) {
//           await store.saveThread({ thread });
//         }

//         const page1 = await store.getThreadsByResourceIdPaginated({ resourceId, page: 0, perPage: 7 });
//         expect(page1.threads).toHaveLength(7);

//         const page3 = await store.getThreadsByResourceIdPaginated({ resourceId, page: 2, perPage: 7 });
//         expect(page3.threads).toHaveLength(3);

//         const limited = await store.getThreadsByResourceIdPaginated({ resourceId, page: 1, perPage: 5 });
//         expect(limited.threads).toHaveLength(5);
//       });
//     });
//   });
// });
