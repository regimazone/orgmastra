import { describe } from 'vitest';
// import { fullStreamTests } from './stream/ai-sdk/test-utils/v4/fullStream';
// import { mergeIntoDataStreamTests } from './stream/ai-sdk/test-utils/v4/mergeIntoDataStream';
// import { optionsTests } from './stream/ai-sdk/test-utils/v4/options';
// import { resultObjectTests } from './stream/ai-sdk/test-utils/v4/result-object';
import { textStreamTests } from './stream/ai-sdk/test-utils/v4/textStream';
// import { toDataStreamResponseTests } from './stream/ai-sdk/test-utils/v4/toDataStreamResponse';
import { execute } from './stream/execute';

const runId = '12345';

describe('V4 tests', () => {
  // optionsTests({ engine: looper });

  // resultObjectTests({ engine: looper });

  textStreamTests({ executeFn: execute, runId });

  // fullStreamTests({ engine: looper, runId });

  // toDataStreamResponseTests({
  //   engine: looper,
  //   version: 'v4',
  // });

  // mergeIntoDataStreamTests({
  //   engine: looper,
  // });
});
