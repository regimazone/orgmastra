import { AgenticLoop } from '../../vnext';
import { createTestModel } from '../../test-utils';

const result = await new AgenticLoop().loop({
  model: createTestModel({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', textDelta: 'Hello' });
        queueMicrotask(() => {
          controller.error(
            Object.assign(new Error('Stream aborted'), {
              name: 'AbortError',
            }),
          );
        });
      },
    }),
  }),
  prompt: 'test-input',
});

try {
  for await (const chunk of result) {
    console.log('chunk', chunk);
  }
  // await result.consumeStream();
} catch (error) {
  console.log('consumeStream error', error);
}
