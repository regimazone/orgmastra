/**
 * Performance testing script to demonstrate the impact of database indexes
 *
 * This script can be used to measure query performance before and after
 * index creation to validate the performance improvements.
 */

import { PostgresStore } from '../index';

interface PerformanceTestConfig {
  connectionString: string;
  testDataSize: number;
  iterations: number;
}

interface PerformanceResult {
  operation: string;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  iterations: number;
  scenario: 'without_indexes' | 'with_indexes';
}

interface PerformanceComparison {
  operation: string;
  withoutIndexes: PerformanceResult;
  withIndexes: PerformanceResult;
  improvementFactor: number;
  improvementPercentage: number;
}

export class PostgresPerformanceTest {
  private store: PostgresStore;
  private config: PerformanceTestConfig;

  constructor(config: PerformanceTestConfig) {
    this.config = config;
    this.store = new PostgresStore({
      connectionString: config.connectionString,
    });
  }

  async init(): Promise<void> {
    await this.store.init();
  }

  async cleanup(): Promise<void> {
    // Clean up test data
    const db = this.store.db;
    await db.none('DELETE FROM mastra_threads WHERE title LIKE $1', ['perf_test_%']);
    await db.none('DELETE FROM mastra_messages WHERE content LIKE $1', ['%perf_test%']);

    // Clean up traces and evals (if tables exist)
    try {
      await db.none('DELETE FROM mastra_traces WHERE id LIKE $1', ['trace_%']);
    } catch (error) {
      // Table might not exist
    }

    try {
      await db.none('DELETE FROM mastra_evals WHERE id LIKE $1', ['eval_%']);
    } catch (error) {
      // Table might not exist
    }
  }

  async dropPerformanceIndexes(): Promise<void> {
    console.log('Dropping performance indexes...');
    const db = this.store.db;

    // Get schema name for index naming
    const schemaPrefix = this.store['schema'] ? `${this.store['schema']}_` : '';

    const indexesToDrop = [
      `${schemaPrefix}mastra_threads_resourceid_idx`,
      `${schemaPrefix}mastra_threads_resourceid_createdat_idx`,
      `${schemaPrefix}mastra_messages_thread_id_idx`,
      `${schemaPrefix}mastra_messages_thread_id_createdat_idx`,
      `${schemaPrefix}mastra_traces_name_idx`,
      `${schemaPrefix}mastra_traces_name_pattern_idx`,
      `${schemaPrefix}mastra_evals_agent_name_idx`,
      `${schemaPrefix}mastra_evals_agent_name_created_at_idx`,
      `${schemaPrefix}mastra_workflow_snapshot_resourceid_idx`,
    ];

    for (const indexName of indexesToDrop) {
      try {
        await db.none(`DROP INDEX IF EXISTS ${indexName}`);
      } catch (error) {
        // Ignore errors for non-existent indexes
        console.warn(`Could not drop index ${indexName}:`, error);
      }
    }
  }

  async createPerformanceIndexes(): Promise<void> {
    console.log('Creating performance indexes...');
    const operations = this.store.stores.operations as any; // Cast to access PG-specific method
    await operations.createPerformanceIndexes();
  }

  async seedTestData(): Promise<void> {
    console.log(`Seeding ${this.config.testDataSize} test records...`);

    const resourceIds = Array.from({ length: Math.ceil(this.config.testDataSize / 10) }, (_, i) => `resource_${i}`);

    // Create threads
    const threads: Array<{
      id: string;
      resourceId: string;
      title: string;
      metadata: string;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    for (let i = 0; i < this.config.testDataSize; i++) {
      const resourceId = resourceIds[i % resourceIds.length]!;
      threads.push({
        id: `thread_${i}`,
        resourceId,
        title: `perf_test_thread_${i}`,
        metadata: JSON.stringify({ test: true, index: i }),
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 30), // Random date within 30 days
        updatedAt: new Date(),
      });
    }

    // Batch insert threads (optimized for large datasets)
    const db = this.store.db;
    console.log(`Inserting ${threads.length} threads...`);

    const batchSize = 1000;
    for (let i = 0; i < threads.length; i += batchSize) {
      const batch = threads.slice(i, i + batchSize);
      const values = batch
        .map(
          (_, index) =>
            `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`,
        )
        .join(', ');

      const params = batch.flatMap(thread => [
        thread.id,
        thread.resourceId,
        thread.title,
        thread.metadata,
        thread.createdAt,
        thread.updatedAt,
      ]);

      await db.none(
        `INSERT INTO mastra_threads (id, "resourceId", title, metadata, "createdAt", "updatedAt") VALUES ${values}`,
        params,
      );

      if (i % (batchSize * 10) === 0) {
        console.log(`  Inserted ${Math.min(i + batchSize, threads.length)} / ${threads.length} threads`);
      }
    }

    // Create messages for threads
    const messages: Array<{
      id: string;
      thread_id: string;
      resourceId: string;
      content: string;
      role: string;
      type: string;
      createdAt: Date;
    }> = [];
    for (let i = 0; i < this.config.testDataSize * 2; i++) {
      const threadId = `thread_${Math.floor(i / 2)}`;
      const resourceId = resourceIds[Math.floor(i / 2) % resourceIds.length]!;
      messages.push({
        id: `message_${i}`,
        thread_id: threadId,
        resourceId,
        content: `perf_test message content ${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        type: 'text',
        createdAt: new Date(Date.now() - Math.random() * 86400000 * 30),
      });
    }

    // Batch insert messages (optimized for large datasets)
    console.log(`Inserting ${messages.length} messages...`);

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const values = batch
        .map(
          (_, index) =>
            `($${index * 7 + 1}, $${index * 7 + 2}, $${index * 7 + 3}, $${index * 7 + 4}, $${index * 7 + 5}, $${index * 7 + 6}, $${index * 7 + 7})`,
        )
        .join(', ');

      const params = batch.flatMap(message => [
        message.id,
        message.thread_id,
        message.resourceId,
        message.content,
        message.role,
        message.type,
        message.createdAt,
      ]);

      await db.none(
        `INSERT INTO mastra_messages (id, thread_id, "resourceId", content, role, type, "createdAt") VALUES ${values}`,
        params,
      );

      if (i % (batchSize * 10) === 0) {
        console.log(`  Inserted ${Math.min(i + batchSize, messages.length)} / ${messages.length} messages`);
      }
    }

    // Create test traces for trace performance testing - PROPERLY SCALED!
    console.log('Inserting traces...');

    // Ensure traces table exists first
    await db.none(`
      CREATE TABLE IF NOT EXISTS mastra_traces (
        id TEXT PRIMARY KEY,
        name TEXT,
        scope TEXT,
        kind INTEGER,
        "startTime" TIMESTAMP,
        "endTime" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    try {
      const traces: Array<{
        id: string;
        name: string;
        scope: string;
        kind: number;
        startTime: Date;
        endTime: Date;
        createdAt: Date;
      }> = [];

      // Use 50% of main dataset size - this is realistic and will show index benefits!
      const tracesCount = Math.floor(this.config.testDataSize * 0.5);
      console.log(`  Creating ${tracesCount.toLocaleString()} traces...`);

      for (let i = 0; i < tracesCount; i++) {
        traces.push({
          id: `trace_${i}`,
          name: i % 5 === 0 ? 'test_trace' : `trace_${i % 10}`, // Some will match our test query
          scope: 'test_scope',
          kind: 1,
          startTime: new Date(Date.now() - Math.random() * 86400000 * 30),
          endTime: new Date(Date.now() - Math.random() * 86400000 * 29),
          createdAt: new Date(Date.now() - Math.random() * 86400000 * 30),
        });
      }

      if (traces.length > 0) {
        for (let i = 0; i < traces.length; i += batchSize) {
          const batch = traces.slice(i, i + batchSize);
          const values = batch
            .map(
              (_, index) =>
                `($${index * 7 + 1}, $${index * 7 + 2}, $${index * 7 + 3}, $${index * 7 + 4}, $${index * 7 + 5}, $${index * 7 + 6}, $${index * 7 + 7})`,
            )
            .join(', ');

          const params = batch.flatMap(trace => [
            trace.id,
            trace.name,
            trace.scope,
            trace.kind,
            trace.startTime,
            trace.endTime,
            trace.createdAt,
          ]);

          await db.none(
            `INSERT INTO mastra_traces (id, name, scope, kind, "startTime", "endTime", "createdAt") VALUES ${values} ON CONFLICT (id) DO NOTHING`,
            params,
          );

          if (i % (batchSize * 10) === 0) {
            console.log(`  Inserted ${Math.min(i + batchSize, traces.length)} / ${traces.length} traces`);
          }
        }
        console.log(`  Inserted ${traces.length} test traces`);
      }
    } catch (error) {
      // Table might not exist, skip traces
      console.log('  Skipping traces (table may not exist)');
    }

    // Create test evals for eval performance testing - PROPERLY SCALED!
    console.log('Inserting evals...');

    // Ensure evals table exists first
    await db.none(`
      CREATE TABLE IF NOT EXISTS mastra_evals (
        id TEXT PRIMARY KEY,
        agent_name TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        score DECIMAL
      )
    `);

    try {
      const evals: Array<{
        id: string;
        agent_name: string;
        created_at: Date;
        score: number;
      }> = [];

      // Use 25% of main dataset size - this is realistic and will show index benefits!
      const evalsCount = Math.floor(this.config.testDataSize * 0.25);
      console.log(`  Creating ${evalsCount.toLocaleString()} evals...`);

      for (let i = 0; i < evalsCount; i++) {
        evals.push({
          id: `eval_${i}`,
          agent_name: i % 3 === 0 ? 'test_agent' : `agent_${i % 5}`, // Some will match our test query
          created_at: new Date(Date.now() - Math.random() * 86400000 * 30),
          score: Math.random(),
        });
      }

      if (evals.length > 0) {
        for (let i = 0; i < evals.length; i += batchSize) {
          const batch = evals.slice(i, i + batchSize);
          const values = batch
            .map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`)
            .join(', ');

          const params = batch.flatMap(evalRow => [evalRow.id, evalRow.agent_name, evalRow.created_at, evalRow.score]);

          await db.none(
            `INSERT INTO mastra_evals (id, agent_name, created_at, score) VALUES ${values} ON CONFLICT (id) DO NOTHING`,
            params,
          );

          if (i % (batchSize * 10) === 0) {
            console.log(`  Inserted ${Math.min(i + batchSize, evals.length)} / ${evals.length} evals`);
          }
        }
        console.log(`  Inserted ${evals.length} test evals`);
      }
    } catch (error) {
      // Table might not exist, skip evals
      console.log('  Skipping evals (table may not exist)');
    }

    console.log('Test data seeding completed');
  }

  async measureOperation(
    name: string,
    operation: () => Promise<any>,
    scenario: 'without_indexes' | 'with_indexes',
  ): Promise<PerformanceResult> {
    const times: number[] = [];

    console.log(`Running ${name} test (${scenario}, ${this.config.iterations} iterations)...`);

    // Warm up the database cache
    await operation();

    for (let i = 0; i < this.config.iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);
    }

    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
    const minTimeMs = Math.min(...times);
    const maxTimeMs = Math.max(...times);

    return {
      operation: name,
      avgTimeMs: Number(avgTimeMs.toFixed(2)),
      minTimeMs: Number(minTimeMs.toFixed(2)),
      maxTimeMs: Number(maxTimeMs.toFixed(2)),
      iterations: this.config.iterations,
      scenario,
    };
  }

  async runPerformanceTests(scenario: 'without_indexes' | 'with_indexes'): Promise<PerformanceResult[]> {
    const results: PerformanceResult[] = [];

    // Test getThreadsByResourceId
    const resourceId = 'resource_0';
    results.push(
      await this.measureOperation(
        'getThreadsByResourceId',
        () => this.store.getThreadsByResourceId({ resourceId }),
        scenario,
      ),
    );

    // Test getThreadsByResourceIdPaginated
    results.push(
      await this.measureOperation(
        'getThreadsByResourceIdPaginated',
        () => this.store.getThreadsByResourceIdPaginated({ resourceId, page: 0, perPage: 20 }),
        scenario,
      ),
    );

    // Test getMessages
    const threadId = 'thread_0';
    results.push(await this.measureOperation('getMessages', () => this.store.getMessages({ threadId }), scenario));

    // Test getMessagesPaginated
    results.push(
      await this.measureOperation(
        'getMessagesPaginated',
        () =>
          this.store.getMessagesPaginated({
            threadId,
            selectBy: { pagination: { page: 0, perPage: 20 } },
          }),
        scenario,
      ),
    );

    // Test getTracesPaginated (if traces exist)
    try {
      results.push(
        await this.measureOperation(
          'getTracesPaginated',
          () => this.store.getTracesPaginated({ page: 0, perPage: 20, name: 'test_trace' }),
          scenario,
        ),
      );
    } catch (error) {
      // Skip if traces table doesn't exist or no traces
      console.log('Skipping getTracesPaginated test (table may not exist)');
    }

    // Test getEvals (if evals exist)
    try {
      results.push(
        await this.measureOperation(
          'getEvals',
          () => this.store.getEvals({ agentName: 'test_agent', page: 0, perPage: 20 }),
          scenario,
        ),
      );
    } catch (error) {
      // Skip if evals table doesn't exist or no evals
      console.log('Skipping getEvals test (table may not exist)');
    }

    return results;
  }

  async runComparisonTest(): Promise<PerformanceComparison[]> {
    console.log('\n=== Running Performance Comparison Test ===');

    // First, test without indexes
    await this.dropPerformanceIndexes();
    await this.analyzeCurrentQueries(); // Show query plans without indexes
    const withoutIndexes = await this.runPerformanceTests('without_indexes');

    // Then, test with indexes
    await this.createPerformanceIndexes();
    await this.analyzeCurrentQueries(); // Show query plans with indexes
    const withIndexes = await this.runPerformanceTests('with_indexes');

    // Calculate comparisons
    const comparisons: PerformanceComparison[] = [];

    for (const withoutResult of withoutIndexes) {
      const withResult = withIndexes.find(r => r.operation === withoutResult.operation);
      if (withResult) {
        const improvementFactor = withoutResult.avgTimeMs / withResult.avgTimeMs;
        const improvementPercentage =
          ((withoutResult.avgTimeMs - withResult.avgTimeMs) / withoutResult.avgTimeMs) * 100;

        comparisons.push({
          operation: withoutResult.operation,
          withoutIndexes: withoutResult,
          withIndexes: withResult,
          improvementFactor: Number(improvementFactor.toFixed(2)),
          improvementPercentage: Number(improvementPercentage.toFixed(1)),
        });
      }
    }

    return comparisons;
  }

  async analyzeCurrentQueries(): Promise<void> {
    const db = this.store.db;
    console.log('\n=== Query Execution Plans ===');

    try {
      // Analyze getThreadsByResourceId query
      const threadPlan = await db.manyOrNone(`
        EXPLAIN (ANALYZE false, FORMAT TEXT) 
        SELECT id, "resourceId", title, metadata, "createdAt", "updatedAt" 
        FROM mastra_threads 
        WHERE "resourceId" = 'resource_0' 
        ORDER BY "createdAt" DESC
      `);
      console.log('getThreadsByResourceId plan:');
      threadPlan.forEach(row => console.log('  ' + row['QUERY PLAN']));

      // Analyze getMessages query
      const messagePlan = await db.manyOrNone(`
        EXPLAIN (ANALYZE false, FORMAT TEXT)
        SELECT id, content, role, type, "createdAt", thread_id AS "threadId", "resourceId" 
        FROM mastra_messages 
        WHERE thread_id = 'thread_0' 
        ORDER BY "createdAt" DESC
      `);
      console.log('\ngetMessages plan:');
      messagePlan.forEach(row => console.log('  ' + row['QUERY PLAN']));
    } catch (error) {
      console.warn('Could not analyze query plans:', error);
    }
  }

  printComparison(comparisons: PerformanceComparison[]): void {
    console.log('\n=== Performance Comparison Results ===');
    console.log('Operation                 | Without (ms) | With (ms) | Improvement | % Faster');
    console.log('--------------------------|--------------|-----------|-------------|----------');

    for (const comp of comparisons) {
      const operation = comp.operation.padEnd(24);
      const without = comp.withoutIndexes.avgTimeMs.toString().padStart(10);
      const with_ = comp.withIndexes.avgTimeMs.toString().padStart(7);
      const improvement = `${comp.improvementFactor}x`.padStart(9);
      const percentage = `${comp.improvementPercentage}%`.padStart(8);

      console.log(`${operation} | ${without} | ${with_} | ${improvement} | ${percentage}`);
    }

    console.log('\n=== Summary ===');
    const avgImprovement = comparisons.reduce((sum, comp) => sum + comp.improvementFactor, 0) / comparisons.length;
    console.log(`Average performance improvement: ${avgImprovement.toFixed(2)}x faster`);

    const maxImprovement = Math.max(...comparisons.map(comp => comp.improvementFactor));
    const maxOp = comparisons.find(comp => comp.improvementFactor === maxImprovement);
    console.log(`Best improvement: ${maxOp?.operation} - ${maxImprovement.toFixed(2)}x faster`);
  }

  printResults(results: PerformanceResult[]): void {
    console.log('\n=== Performance Test Results ===');
    console.log('Operation                 | Scenario         | Avg (ms) | Min (ms) | Max (ms) | Iterations');
    console.log('--------------------------|------------------|----------|----------|----------|----------');

    for (const result of results) {
      const operation = result.operation.padEnd(24);
      const scenario = result.scenario.padEnd(16);
      const avg = result.avgTimeMs.toString().padStart(8);
      const min = result.minTimeMs.toString().padStart(8);
      const max = result.maxTimeMs.toString().padStart(8);
      const iterations = result.iterations.toString().padStart(8);

      console.log(`${operation} | ${scenario} | ${avg} | ${min} | ${max} | ${iterations}`);
    }
  }

  async checkIndexes(): Promise<void> {
    const db = this.store.db;
    const indexes = await db.manyOrNone(`
      SELECT schemaname, tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE indexname LIKE '%mastra_%_idx'
      ORDER BY tablename, indexname
    `);

    console.log('\n=== Available Indexes ===');
    if (indexes.length === 0) {
      console.log('No performance indexes found');
    } else {
      for (const index of indexes) {
        console.log(`${index.tablename}: ${index.indexname}`);
      }
    }
  }
}

// Example usage
async function runTest() {
  const test = new PostgresPerformanceTest({
    connectionString: process.env.DB_URL || 'postgresql://postgres:postgres@localhost:5432/mastra',
    testDataSize: 1000,
    iterations: 10,
  });

  try {
    await test.init();
    await test.cleanup();
    await test.seedTestData();

    // Run comparison test
    const comparisons = await test.runComparisonTest();
    test.printComparison(comparisons);

    await test.checkIndexes();
    await test.cleanup();
  } catch (error) {
    console.error('Performance test failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  runTest().catch(console.error);
}
