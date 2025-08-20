import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { MetricResult, TestInfo } from '../../../eval';
import type { StorageEvalRow } from '../../types';
import type { InMemoryEvals } from './inmemory';
import { InMemoryLegacyEvals } from './inmemory';

describe('InMemoryLegacyEvals', () => {
  let store: InMemoryLegacyEvals;
  let collection: InMemoryEvals;

  const baseEval: StorageEvalRow = {
    test_info: null,
    agent_name: 'test-agent',
    input: 'test input',
    output: 'test output',
    instructions: 'test instructions',
    result: {} as MetricResult,
    created_at: new Date('2023-01-01'),
    metric_name: 'test-metric',
    run_id: 'test-run',
    global_run_id: 'test-global-run',
  };

  function makeEval(id: string, testInfo?: TestInfo): StorageEvalRow {
    return {
      ...baseEval,
      ...(testInfo ? { test_info: testInfo } : {}),
    };
  }

  beforeEach(() => {
    collection = new Map();
    store = new InMemoryLegacyEvals({ collection });
  });

  afterEach(() => {
    collection.clear();
  });

  it('should return evals sorted by createdAt in descending order', async () => {
    // Arrange: Create 3 StorageEvalRow entries with different timestamps
    const now = new Date();
    const evals: StorageEvalRow[] = [
      {
        test_info: null,
        agent_name: 'test-agent',
        input: 'input1',
        output: 'output1',
        instructions: 'instructions1',
        result: { score: 1 },
        created_at: new Date(now.getTime() - 2 * 60000), // 2 minutes ago
        metric_name: 'accuracy',
        run_id: 'run1',
        global_run_id: 'global1',
      },
      {
        test_info: null,
        agent_name: 'test-agent',
        input: 'input2',
        output: 'output2',
        instructions: 'instructions2',
        result: { score: 0.5 },
        created_at: new Date(now.getTime() - 60000), // 1 minute ago
        metric_name: 'accuracy',
        run_id: 'run2',
        global_run_id: 'global2',
      },
      {
        test_info: null,
        agent_name: 'test-agent',
        input: 'input3',
        output: 'output3',
        instructions: 'instructions3',
        result: { score: 0.8 },
        created_at: now, // Most recent
        metric_name: 'accuracy',
        run_id: 'run3',
        global_run_id: 'global3',
      },
    ];

    // Store evals in collection
    evals.forEach(evalRow => collection.set(evalRow.run_id, evalRow));

    // Act: Get evals for test-agent
    const result = await store.getEvalsByAgentName('test-agent');

    // Assert: Verify descending order by createdAt
    expect(result.length).toBe(3);
    expect(new Date(result[0].createdAt).getTime()).toBeGreaterThan(new Date(result[1].createdAt).getTime());
    expect(new Date(result[1].createdAt).getTime()).toBeGreaterThan(new Date(result[2].createdAt).getTime());
    expect(new Date(result[0].createdAt)).toEqual(now);
  });

  it('should correctly map StorageEvalRow fields to EvalRow format', async () => {
    // Arrange: Create StorageEvalRow with all fields populated
    const testInfo: TestInfo = {
      testPath: '/tests/example.test.ts',
      testName: 'example test',
    };
    const metricResult: MetricResult = {
      score: 0.95,
      info: { reason: 'Good response' },
    };
    const createdAt = new Date();

    const storageEval: StorageEvalRow = {
      agent_name: 'test-agent',
      input: 'test input',
      output: 'test output',
      instructions: 'test instructions',
      result: metricResult,
      created_at: createdAt,
      metric_name: 'accuracy',
      run_id: 'test-run',
      global_run_id: 'global-test-run',
      test_info: testInfo,
    };

    collection.set(storageEval.run_id, storageEval);

    // Act: Get evals for test-agent
    const result = await store.getEvalsByAgentName('test-agent');

    // Assert: Verify field mapping
    expect(result.length).toBe(1);
    const mappedEval = result[0];
    expect(mappedEval).toEqual({
      agentName: 'test-agent',
      input: 'test input',
      output: 'test output',
      instructions: 'test instructions',
      result: metricResult,
      createdAt: createdAt.toISOString(),
      metricName: 'accuracy',
      runId: 'test-run',
      globalRunId: 'global-test-run',
      testInfo: testInfo,
    });
  });

  it('should return only evals with testPath when type=test', async () => {
    // Arrange: Add evals with different test_info configurations
    const evalWithTestPath = makeEval('1', { testPath: '/test/path' } as TestInfo);
    const evalWithEmptyTestInfo = makeEval('2', {} as TestInfo);
    const evalWithoutTestInfo = makeEval('3');

    collection.set('1', evalWithTestPath);
    collection.set('2', evalWithEmptyTestInfo);
    collection.set('3', evalWithoutTestInfo);

    // Act: Get test evals
    const result = await store.getEvalsByAgentName('test-agent', 'test');

    // Assert: Only eval with testPath is returned
    expect(result).toHaveLength(1);
    expect(result[0].testInfo).toBeDefined();
    expect(result[0].testInfo?.testPath).toBe('/test/path');
  });

  it('should return only evals without testPath when type=live', async () => {
    // Arrange: Add evals with different test_info configurations
    const evalWithTestPath = makeEval('1', { testPath: '/test/path' } as TestInfo);
    const evalWithEmptyTestInfo = makeEval('2', {} as TestInfo);
    const evalWithoutTestInfo = makeEval('3');

    collection.set('1', evalWithTestPath);
    collection.set('2', evalWithEmptyTestInfo);
    collection.set('3', evalWithoutTestInfo);

    // Act: Get live evals
    const result = await store.getEvalsByAgentName('test-agent', 'live');

    // Assert: Only evals without testPath are returned
    expect(result).toHaveLength(2);
    result.forEach(evaluation => {
      expect(evaluation.testInfo?.testPath).toBeUndefined();
    });
  });

  it('should return all evals for agent when no type is specified', async () => {
    // Arrange: Create test and live evals for target agent and noise evals
    const targetAgentTestEval = makeEval('test1', { testPath: 'test/path' });
    targetAgentTestEval.created_at = new Date('2023-01-02');

    const targetAgentLiveEval = makeEval('live1');
    targetAgentLiveEval.created_at = new Date('2023-01-03');

    const otherAgentEval = makeEval('other1');
    otherAgentEval.agent_name = 'other-agent';

    collection.set('test1', targetAgentTestEval);
    collection.set('live1', targetAgentLiveEval);
    collection.set('other1', otherAgentEval);

    // Act: Get evals for target agent without type filter
    const result = await store.getEvalsByAgentName('test-agent');

    // Assert: Verify results contain both evals for target agent in correct order
    expect(result).toHaveLength(2);
    expect(result[0].agentName).toBe('test-agent');
    expect(result[0].createdAt).toBe('2023-01-03T00:00:00.000Z');
    expect(result[1].agentName).toBe('test-agent');
    expect(result[1].createdAt).toBe('2023-01-02T00:00:00.000Z');
    expect(result.every(e => e.agentName === 'test-agent')).toBe(true);
  });

  it('should return empty array when no evals exist for agent name', async () => {
    // Arrange: Add evals for different agents
    const eval1 = makeEval('test1');
    eval1.agent_name = 'agent-1';

    const eval2 = makeEval('test2');
    eval2.agent_name = 'agent-2';

    collection.set('test1', eval1);
    collection.set('test2', eval2);

    // Act: Get evals for non-existent agent
    const result = await store.getEvalsByAgentName('non-existent-agent');

    // Assert: Verify empty array is returned
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });
});
