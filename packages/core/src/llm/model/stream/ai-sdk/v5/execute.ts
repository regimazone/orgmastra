import type { LanguageModelV2 } from '@ai-sdk/provider-v5';
import type { ToolSet } from 'ai-v5';
import type { ExecutionProps } from '../../types';
import { prepareToolsAndToolChoice } from './prepare-tools';
import { AISDKV5InputStream } from './input';
import { MessageList } from '../../../../../agent';

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
      const messages = MessageList.fromArray(inputMessages);

      try {
        const stream = await model.doStream({
          ...toolsAndToolChoice,
          prompt: messages.get.all.model(),
        });
        // prompt: inputMessages.map(m => {
        //   if (m.role === 'tool') {
        //     return {
        //       ...m,
        //       content: m.content.map(c => {
        //         return {
        //           toolCallId: c.toolCallId,
        //           output: {
        //             type: typeof c.result === 'string' ? 'text' : 'json',
        //             value: c.result,
        //           },
        //         };
        //       }),
        //     };
        //   }

        //   if (m.role === 'assistant') {
        //     return {
        //       ...m,
        //       content: m.content.map(c => {
        //         if (c.type === 'tool-call') {
        //           return {
        //             ...c,
        //             input: c.args,
        //           };
        //         }
        //         return c;
        //       }),
        //     };
        //   }

        //   return m;
        // });
        return stream as any;
      } catch (error) {
        console.error('Error creating stream', error);
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
