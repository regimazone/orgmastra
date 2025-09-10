import { ThreadMessageLike } from '@assistant-ui/react';

export const handleNetworkMessageFromMemory = (content: any): ThreadMessageLike => {
  console.log('content', content);
  return {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: content.finalResult.runId,
        toolName: content.resourceId,
        result: { runId: content.finalResult.runId },
      },
    ],
  };
};
