import type { LanguageModelV2 } from '@ai-sdk/provider-v5';
import { prepareToolsAndToolChoice } from '../../../prepare-tools';
import type { ExecutionProps } from '../../types';
import { AISDKV4InputStream } from '../v4/input';

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
  const v4 = new AISDKV4InputStream({
    component: 'LLM',
    name: model.modelId,
  });

  const stream = v4.initialize({
    runId,
    onResult,
    createStream: async () => {
      try {
        const stream = await model.doStream({
          tools: Object.entries(tools ?? {}).map(([name, tool]) => {
            return {
              name,
              description: tool.description,
              parameters: tool.parameters,
              type: 'function',
              inputSchema: tool.parameters,
            };
          }),
          toolChoice: toolChoice as any, // TODO: fix this?
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
