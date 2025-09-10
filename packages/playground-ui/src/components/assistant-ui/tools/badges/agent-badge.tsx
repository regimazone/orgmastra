import { AgentIcon } from '@/ds/icons';
import { BadgeWrapper } from './badge-wrapper';
import { ToolBadge } from './tool-badge';
import { useWorkflow } from '@/hooks/use-workflows';
import { useWorkflowStream, WorkflowBadge } from './workflow-badge';
import { LoadingBadge } from './loading-badge';
import { ToolFallback } from '../tool-fallback';

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
        if (message.type === 'text') {
          return message.content;
        }

        return (
          <ToolFallback
            toolName={message.toolName}
            argsText={message.toolInput ? JSON.stringify(message.toolInput) : ''}
            result={message.toolOutput ? JSON.stringify(message.toolOutput) : ''}
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

const InnerWorkflowHandler = ({ partialChunk, workflowId }: { partialChunk: any; workflowId: string }) => {
  useWorkflowStream(partialChunk);
  const { data: workflow, isLoading } = useWorkflow(workflowId);

  console.log('workflow', workflow);

  if (isLoading) return <LoadingBadge />;

  if (workflow) {
    return <WorkflowBadge workflow={workflow} workflowId={workflowId} isStreaming />;
  }

  return null;
};
