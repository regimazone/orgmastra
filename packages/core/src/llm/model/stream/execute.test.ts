import { describe } from 'vitest';
import { fullStreamTests } from './ai-sdk/test-utils/v4/fullStream';
import { resultObjectTests } from './ai-sdk/test-utils/v4/result-object';
import { textStreamTests } from './ai-sdk/test-utils/v4/textStream';
import { execute } from './execute';

const runId = '12345';

describe('V4 tests', () => {
  // optionsTests({ engine: looper });

  resultObjectTests({ executeFn: execute, runId });

  textStreamTests({
    executeFn: execute,
    runId,
  });

  fullStreamTests({ executeFn: execute, runId });

  // toDataStreamResponseTests({
  //     engine: looper,
  //     version: 'v4',
  // });

  // mergeIntoDataStreamTests({
  //     engine: looper,
  // });
});
