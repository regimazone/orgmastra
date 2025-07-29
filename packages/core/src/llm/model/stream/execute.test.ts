import { describe } from 'vitest';
import { textStreamTests } from './ai-sdk/test-utils/v4/textStream';
import { execute } from './execute';

const runId = '12345';

describe('V4 tests', () => {
  // optionsTests({ engine: looper });

  // resultObjectTests({ engine: looper });

  textStreamTests({
    executeFn: {
      loop: execute,
    },
    runId,
  });

  // fullStreamTests({ engine: looper, runId });

  // toDataStreamResponseTests({
  //     engine: looper,
  //     version: 'v4',
  // });

  // mergeIntoDataStreamTests({
  //     engine: looper,
  // });
});
