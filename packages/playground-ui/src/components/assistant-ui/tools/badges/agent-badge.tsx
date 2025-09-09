import { AgentIcon } from '@/ds/icons';
import { BadgeWrapper } from './badge-wrapper';
import { ToolBadge } from './tool-badge';

export type BadgeMessage =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'tool';
      toolName: string;
      toolInput?: any;
      toolOutput?: any;
    };
[];

export interface AgentBadgeProps {
  agentId: string;
  isStreaming?: boolean;
  messages: BadgeMessage[];
}

export const AgentBadge = ({ agentId, isStreaming, messages = [] }: AgentBadgeProps) => {
  return (
    <BadgeWrapper icon={<AgentIcon className="text-accent1" />} title={agentId} initialCollapsed={false}>
      {messages.map(message => {
        if (message.type === 'text') {
          return message.content;
        }

        if (message.type === 'tool') {
          return (
            <ToolBadge
              toolName={message.toolName}
              argsText={message.toolInput ? JSON.stringify(message.toolInput) : ''}
              result={message.toolOutput ? JSON.stringify(message.toolOutput) : ''}
            />
          );
        }
      })}
    </BadgeWrapper>
  );
};
