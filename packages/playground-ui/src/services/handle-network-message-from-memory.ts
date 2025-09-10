import { BadgeMessage } from '@/components/assistant-ui/tools/badges/agent-badge';
import { ThreadMessageLike } from '@assistant-ui/react';

export const handleNetworkMessageFromMemory = (content: any): ThreadMessageLike => {
  console.log('content', content);

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

      let toolCalls: Record<string, any> = {};

      for (const part of message.content) {
        if (part.type === 'text') {
          badgeMessages.push({
            type: 'text',
            content: part.content,
          });
        } else if (part.type === 'tool-result') {
          console.log('lolx', toolCalls, part);
          badgeMessages.push({
            type: 'tool',
            toolName: part.toolName,
            toolInput: toolCalls?.[part.toolCallId]?.args || {},
            result: part.result, // for workflow runId
            toolOutput: part.result, // tool output
            toolCallId: part.toolCallId,
            args: part.args || {},
          });
        } else if (part.type === 'tool-call') {
          toolCalls[part.toolCallId] = part;
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

  if (content.resourceType === 'tool') {
    return {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: content.toolCallId,
          toolName: content.resourceId,
          result: content.result,
          args: content.args,
        },
      ],
    };
  }

  return { role: 'assistant', content: [{ type: 'text', text: 'blah' }] };
};
