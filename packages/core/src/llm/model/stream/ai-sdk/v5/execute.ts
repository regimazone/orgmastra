import type { LanguageModelV2 } from '@ai-sdk/provider-v5';
import type { ToolSet } from 'ai-v5';
import type { ExecutionProps } from '../../types';
import { prepareToolsAndToolChoice } from './prepare-tools';
import { AISDKV5InputStream } from './input';

export function executeV5({
  runId,
  model,
  providerMetadata,
  inputMessages,
  tools,
  activeTools,
  toolChoice,
  onResult,
}: ExecutionProps & {
  model: LanguageModelV2;
  onResult: (result: { warnings: any; request: any; rawResponse: any }) => void;
}) {
  const v5 = new AISDKV5InputStream({
    component: 'LLM',
    name: model.modelId,
  });

  const toolsAndToolChoice = prepareToolsAndToolChoice({
    tools: tools as ToolSet,
    toolChoice,
    activeTools,
  });

  const stream = v5.initialize({
    runId,
    onResult,
    createStream: async () => {
      try {
        const stream = await model.doStream({
          ...toolsAndToolChoice,
          prompt: inputMessages as any, // TODO: fix this?
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
