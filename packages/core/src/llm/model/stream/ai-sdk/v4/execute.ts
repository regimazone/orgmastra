import { prepareToolsAndToolChoice } from '../../../prepare-tools';
import type { ExecutionProps } from '../../types';
import { AISDKV4InputStream } from './input';

export function executeV4({
  runId,
  model,
  providerMetadata,
  inputMessages,
  tools,
  activeTools,
  toolChoice,
  onResult,
}: ExecutionProps & {
  onResult: (result: { warnings: any; request: any; rawResponse: any }) => void;
}) {
  const v4 = new AISDKV4InputStream({
    component: 'LLM',
    name: model.modelId,
  });

  const preparedTools = prepareToolsAndToolChoice({
    tools,
    toolChoice: toolChoice,
    activeTools: activeTools,
  });

  const stream = v4.initialize({
    runId,
    onResult,
    createStream: async () => {
      try {
        const stream = await model.doStream({
          inputFormat: 'messages',
          mode: {
            type: 'regular',
            ...preparedTools,
          },
          providerMetadata,
          prompt: inputMessages,
        });

        return stream as any;
      } catch (error) {
        return {
          stream: new ReadableStream({
            start: async controller => {
              controller.enqueue({
                type: 'error',
                error,
              });
              controller.close();
            },
          }),
          warnings: [],
          request: {},
          rawResponse: {},
        };
      }
    },
  });

  return stream;
}
