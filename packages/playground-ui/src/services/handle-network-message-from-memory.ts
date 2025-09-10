import { BadgeMessage } from '@/components/assistant-ui/tools/badges/agent-badge';
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
    const badgeMessages: BadgeMessage[] = [];

    return {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: content.finalResult.runId,
          toolName: content.resourceId,
          result: { runId: content.finalResult.runId },
          args: {
            __mastraMetadata: {
              from: 'AGENT',
              messages: badgeMessages,
            },
          },
        },
      ],
    };
  }

  return { role: 'assistant', content: [{ type: 'text', text: 'blah' }] };
};
