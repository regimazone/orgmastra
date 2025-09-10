import { ThreadMessageLike } from '@assistant-ui/react';

export const handleNetworkMessageFromMemory = (content: any): ThreadMessageLike => {
  if (content.resourceType === 'workflow') {
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
  }

  if (content.resourceType === 'agent') {
    console.log('content', content);
  }

  return { role: 'assistant', content: [{ type: 'text', text: 'blah' }] };
};
