import { describe } from 'vitest';
import { fullStreamTests } from './ai-sdk/v4/fullStream';
import { mergeIntoDataStreamTests } from './ai-sdk/v4/mergeIntoDataStream';
import { textStreamTests } from './ai-sdk/v4/textStream';
import { toDataStreamResponseTests } from './ai-sdk/v4/toDataStreamResponse';
import { AgenticLoop } from './vnext';

const looper = new AgenticLoop();

const runId = '12345';

describe('V4 tests', () => {
  textStreamTests({ engine: looper, runId });

  fullStreamTests({ engine: looper, runId });

  toDataStreamResponseTests({
    engine: looper,
    version: 'v4',
  });

  mergeIntoDataStreamTests({
    engine: looper,
  });
});
