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
}: ExecutionProps) {
  const v4 = new AISDKV4InputStream({
    component: 'LLM',
    name: model.modelId,
  });

  const preparedTools = prepareToolsAndToolChoice({
    tools,
    toolChoice: toolChoice,
    activeTools: activeTools,
  });

  let warnings;
  let request = {};
  let rawResponse:
    | {
        headers?: Record<string, any>;
      }
    | undefined;

  const stream = v4.initialize({
    runId,
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

        warnings = stream.warnings;
        request = stream.request || {};
        rawResponse = stream.rawResponse;

        return stream.stream as any;
      } catch (error) {
        return new ReadableStream({
          start: async controller => {
            controller.enqueue({
              type: 'error',
              error,
            });
            controller.close();
          },
        });
      }
    },
  });

  return {
    stream,
    warnings,
    request,
    rawResponse,
  };
}
