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
    const badgeMessages: BadgeMessage[] = [];
    // First message is sliced because it's the agent network prompt
    const messages = content.finalResult.messages.slice(1);
    for (const message of messages) {
      if (typeof message.content === 'string') {
        badgeMessages.push({
          type: 'text',
          content: message.content,
        });

        continue;
      }

      for (const part of message.content) {
        if (part.type === 'text') {
          badgeMessages.push({
            type: 'text',
            content: part.content,
          });
        } else if (part.type === 'tool-result') {
          badgeMessages.push({
            type: 'tool',
            toolName: part.toolName,
            toolInput: part.toolInput,
            result: part.result,
            toolCallId: part.toolCallId,
            args: part.args || {},
          });
        }
      }
    }

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

  console.log('content', content);

  return { role: 'assistant', content: [{ type: 'text', text: 'blah' }] };
};
