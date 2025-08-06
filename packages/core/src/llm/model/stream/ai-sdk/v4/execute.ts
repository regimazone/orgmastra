import type { LanguageModelV1, ToolSet } from 'ai';
import type { ExecutionProps } from '../../types';
import { AISDKV4InputStream } from './input';
import { prepareToolsAndToolChoice } from './prepare-tools';

export function executeV4({
  runId,
  model,
  headers,
  providerMetadata,
  providerOptions,
  inputMessages,
  tools,
  activeTools,
  toolChoice,
  onResult,
  options,
}: ExecutionProps & {
  model: LanguageModelV1;
  onResult: (result: { warnings: any; request: any; rawResponse: any }) => void;
}) {
  const { mode, output } = options;

  const v4 = new AISDKV4InputStream({
    component: 'LLM',
    name: model.modelId,
  });

  const preparedTools = prepareToolsAndToolChoice({
    tools: tools as ToolSet,
    toolChoice: toolChoice,
    activeTools: activeTools,
  });

  const stream = v4.initialize({
    runId,
    onResult,
    createStream: async () => {
      try {
        if (mode === 'json') {
          let outputType = output;
          if (!outputType) {
            outputType = 'no-schema';
          }

          // TODO if outputStrategy.jsonSchema === null, inject json structions
          // https://github.com/vercel/ai/blob/v4/packages/ai/core/generate-object/inject-json-instruction.ts
          const stream = await model.doStream({
            inputFormat: 'messages',
            mode: {
              type: 'object-json',
              schema: undefined,
              // schema: outputStrategy.jsonSchema,
              // name: schemaName,
              // description: schemaDescription,
            },
            providerMetadata: providerOptions ? { ...(providerMetadata ?? {}), ...providerOptions } : providerMetadata,
            prompt: inputMessages,
            headers,
          });

          return stream as any;
        }

        const stream = await model.doStream({
          inputFormat: 'messages',
          mode: {
            type: 'regular',
            ...preparedTools,
          },
          providerMetadata: providerOptions ? { ...(providerMetadata ?? {}), ...providerOptions } : providerMetadata,
          prompt: inputMessages,
          headers,
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
