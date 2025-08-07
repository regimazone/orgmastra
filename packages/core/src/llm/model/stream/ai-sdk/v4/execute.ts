import type { LanguageModelV1, LanguageModelV1CallOptions, ToolSet } from 'ai';
import { asSchema } from 'ai-v5';
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
  const {
    mode = 'regular',
    output = 'no-schema',
    schema,
    schemaName,
    schemaDescription,
  } = options ?? { mode: 'regular' };

  const v4 = new AISDKV4InputStream({
    component: 'LLM',
    name: model.modelId,
  });

  const preparedTools = prepareToolsAndToolChoice({
    tools: tools as ToolSet,
    toolChoice: toolChoice,
    activeTools: activeTools,
  });

  const jsonSchema = schema ? asSchema(schema).jsonSchema : undefined;

  // TODO: is there a better place to inject this system message?
  // For models that don't support structured outputs, inject the json schema as the first system message (exactly the same as streamObject/generateObject in v4)
  if (mode === 'object-json' && jsonSchema && !model.supportsStructuredOutputs) {
    inputMessages.unshift({
      role: 'system',
      content: `JSON schema:\n${JSON.stringify(jsonSchema)}\nYou MUST answer with a JSON object that matches the JSON schema above.`,
    });
  }

  const providerMetadataOption = providerOptions
    ? { ...(providerMetadata ?? {}), ...providerOptions }
    : providerMetadata;

  const stream = v4.initialize({
    runId,
    onResult,
    createStream: async () => {
      try {
        const modeOption = ((): LanguageModelV1CallOptions['mode'] => {
          switch (mode) {
            case 'regular':
              return {
                type: 'regular' as const,
                ...preparedTools,
              };
            case 'object-json':
              return {
                type: 'object-json' as const,
                schema: jsonSchema,
                name: schemaName,
                description: schemaDescription,
              };
            case 'object-tool':
              if (!jsonSchema) {
                throw new Error('JSON schema is required for object-tool mode');
              }
              return {
                type: 'object-tool' as const,
                tool: {
                  type: 'function' as const,
                  name: schemaName ?? 'json',
                  description: schemaDescription ?? 'Respond with a JSON object.',
                  parameters: jsonSchema,
                },
              };
            default:
              throw new Error(`Unsupported mode: ${mode}`);
          }
        })();

        const stream = await model.doStream({
          inputFormat: 'messages',
          mode: modeOption,
          providerMetadata: providerMetadataOption,
          prompt: inputMessages,
          headers,
        });

        return stream;
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
