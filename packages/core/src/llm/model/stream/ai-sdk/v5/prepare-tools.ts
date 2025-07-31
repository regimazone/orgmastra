import type {
  LanguageModelV2FunctionTool,
  LanguageModelV2ProviderDefinedTool,
  LanguageModelV2ToolChoice,
} from '@ai-sdk/provider-v5';
import type { ToolChoice, ToolSet } from 'ai-v5';
import { asSchema } from 'ai-v5';

export function prepareToolsAndToolChoice<TOOLS extends ToolSet>({
  tools,
  toolChoice,
  activeTools,
}: {
  tools: TOOLS | undefined;
  toolChoice: ToolChoice<TOOLS> | undefined;
  activeTools: Array<keyof TOOLS> | undefined;
}): {
  tools: Array<LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool> | undefined;
  toolChoice: LanguageModelV2ToolChoice | undefined;
} {
  if (Object.keys(tools || {}).length === 0) {
    return {
      tools: undefined,
      toolChoice: undefined,
    };
  }

  // when activeTools is provided, we only include the tools that are in the list:
  const filteredTools =
    activeTools != null
      ? Object.entries(tools || {}).filter(([name]) => activeTools.includes(name as keyof TOOLS))
      : Object.entries(tools || {});

  return {
    tools: filteredTools.map(([name, tool]) => {
      const toolType = tool.type;
      switch (toolType) {
        case undefined:
        case 'dynamic':
        case 'function':
          return {
            type: 'function' as const,
            name,
            description: tool.description,
            inputSchema: asSchema(tool.inputSchema).jsonSchema,
            providerOptions: tool.providerOptions,
          };
        case 'provider-defined':
          return {
            type: 'provider-defined' as const,
            name,
            id: tool.id,
            args: tool.args,
          };
        default: {
          const exhaustiveCheck: never = toolType;
          throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
        }
      }
    }),
    toolChoice:
      toolChoice == null
        ? { type: 'auto' }
        : typeof toolChoice === 'string'
          ? { type: toolChoice }
          : { type: 'tool' as const, toolName: toolChoice.toolName as string },
  };
}
