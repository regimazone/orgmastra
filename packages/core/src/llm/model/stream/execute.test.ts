import { describe } from 'vitest';
import { fullStreamTests } from './ai-sdk/test-utils/v4/fullStream';
import { mergeIntoDataStreamTests } from './ai-sdk/test-utils/v4/mergeIntoDataStream';
import { optionsTests } from './ai-sdk/test-utils/v4/options';
import { resultObjectTests } from './ai-sdk/test-utils/v4/result-object';
import { textStreamTests } from './ai-sdk/test-utils/v4/textStream';
import { toDataStreamResponseTests } from './ai-sdk/test-utils/v4/toDataStreamResponse';
import { execute } from './execute';

const runId = '12345';

describe('V4 tests', () => {
  optionsTests({ executeFn: execute, runId });

  resultObjectTests({ executeFn: execute, runId });

  textStreamTests({
    executeFn: execute,
    runId,
  });

  fullStreamTests({ executeFn: execute, runId });

  toDataStreamResponseTests({
    executeFn: execute,
    runId,
  });

  mergeIntoDataStreamTests({
    executeFn: execute,
    runId,
  });
});
