import { AgentIcon } from '@/ds/icons';
import { BadgeWrapper } from './badge-wrapper';

import { useWorkflow } from '@/hooks/use-workflows';
import { useWorkflowStream, WorkflowBadge } from './workflow-badge';
import { LoadingBadge } from './loading-badge';
import { ToolFallback } from '../tool-fallback';
import { WorkflowWatchResult } from '@mastra/client-js';

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
      args?: any;
      toolCallId: string;
      result?: any;
    };
[];

export interface AgentBadgeProps {
  agentId: string;
  messages: BadgeMessage[];
}

export const AgentBadge = ({ agentId, messages = [] }: AgentBadgeProps) => {
  return (
    <BadgeWrapper icon={<AgentIcon className="text-accent1" />} title={agentId} initialCollapsed={false}>
      {messages.map(message => {
        console.log('message', message);
        if (message.type === 'text') {
          return message.content;
        }

        return (
          <ToolFallback
            toolName={message.toolName}
            argsText={message.toolInput ? JSON.stringify(message.toolInput) : ''}
            result={message?.result || (message.toolOutput ? JSON.stringify(message.toolOutput) : '')}
            args={message.args}
            status={{ type: 'complete' }}
            type="tool-call"
            toolCallId={message.toolCallId}
            addResult={() => {}}
          />
        );
      })}
    </BadgeWrapper>
  );
};
