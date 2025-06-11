import { useAgent } from '@/hooks/use-agents';
import { useWorkflow } from '@/hooks/use-workflows';
import { Spinner, WorkflowGraph } from '@mastra/playground-ui';
import { useNavigate, useParams, useSearchParams } from 'react-router';

export const Workflow = () => {
  const { workflowId } = useParams();
  const [searchParams] = useSearchParams();

  const agentId = searchParams.get('agentId');

  if (agentId) {
    return <WorkflowGraphWithAgent agentId={agentId} workflowId={workflowId!} />;
  }

  return <WorkflowGraphDefault workflowId={workflowId!} />;
};

const WorkflowGraphWithAgent = ({ agentId, workflowId }: { agentId: string; workflowId: string }) => {
  const { agent, isLoading } = useAgent(agentId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full w-full">
        <Spinner />
      </div>
    );
  }

  if (!agent) {
    return <div>Agent not found</div>;
  }

  const workflow = agent.workflows[workflowId];
  console.log('lol', workflow);

  return (
    <WorkflowGraph
      workflowId={workflowId!}
      workflow={workflow}
      isLoading={isLoading}
      onShowTrace={({ runId, stepName }) => {
        navigate(`/workflows/${workflowId}/traces?runId=${runId}&stepName=${stepName}`);
      }}
    />
  );
};

const WorkflowGraphDefault = ({ workflowId }: { workflowId: string }) => {
  const { data: workflow, isLoading } = useWorkflow(workflowId);

  const navigate = useNavigate();

  return (
    <WorkflowGraph
      workflowId={workflowId!}
      workflow={workflow}
      isLoading={isLoading}
      onShowTrace={({ runId, stepName }) => {
        navigate(`/workflows/${workflowId}/traces?runId=${runId}&stepName=${stepName}`);
      }}
    />
  );
};
