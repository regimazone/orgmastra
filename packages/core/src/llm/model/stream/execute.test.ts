import { describe } from 'vitest';
import { fullStreamTests as fullStreamTestsV4 } from './ai-sdk/test-utils/v4/fullStream';
import { mergeIntoDataStreamTests } from './ai-sdk/test-utils/v4/mergeIntoDataStream';
import { optionsTests } from './ai-sdk/test-utils/v4/options';
import { resultObjectTests as resultObjectTestsV4 } from './ai-sdk/test-utils/v4/result-object';
import { textStreamTests as textStreamTestsV4 } from './ai-sdk/test-utils/v4/textStream';
import { toDataStreamResponseTests } from './ai-sdk/test-utils/v4/toDataStreamResponse';
import { fullStreamTests as fullStreamTestsV5 } from './ai-sdk/test-utils/v5/fullStream';
import { resultObjectTests as resultObjectTestsV5 } from './ai-sdk/test-utils/v5/result-object';
import { textStreamTests as textStreamTestsV5 } from './ai-sdk/test-utils/v5/textStream';
import { toUIMessageStreamTests } from './ai-sdk/test-utils/v5/toUIMessageStream';
import { execute } from './execute';

const runId = '12345';

describe('V4 tests', () => {
  optionsTests({ executeFn: execute, runId });

  resultObjectTestsV4({ executeFn: execute, runId });

  textStreamTestsV4({
    executeFn: execute,
    runId,
  });

  fullStreamTestsV4({ executeFn: execute, runId });

  toDataStreamResponseTests({
    executeFn: execute,
    runId,
  });

  mergeIntoDataStreamTests({
    executeFn: execute,
    runId,
  });
});

describe('V5 tests', () => {
  resultObjectTestsV5({ executeFn: execute, runId });

  textStreamTestsV5({ executeFn: execute, runId });

  fullStreamTestsV5({ executeFn: execute, runId });

  toUIMessageStreamTests({ executeFn: execute, runId });
});
