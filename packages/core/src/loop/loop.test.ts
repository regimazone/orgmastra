import { describe } from 'vitest';
import { loop } from './loop';
import { fullStreamTests } from './test-utils/fullStream';
import { textStreamTests } from './test-utils/textStream';

describe('Loop Tests', () => {
  describe('AISDK v5', () => {
    textStreamTests({ loopFn: loop, runId: 'test-run-id' });
    fullStreamTests({ loopFn: loop, runId: 'test-run-id' });
  });

  // toolsTestsV5({ executeFn: execute, runId });

  // telemetryTestsV5({ executeFn: execute, runId });

  // optionsTestsV5({ executeFn: execute, runId });

  // resultObjectTestsV5({ executeFn: execute, runId });

  // textStreamTestsV5({ executeFn: execute, runId });

  // fullStreamTestsV5({ executeFn: execute, runId });

  // toUIMessageStreamTests({ executeFn: execute, runId });

  // generateTextTestsV5({ executeFn: execute, runId });
});
