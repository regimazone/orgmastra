import { client } from '@/lib/client';
import { WorkflowGraph } from '@mastra/playground-ui';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

export const Workflow = () => {
  const { workflowId } = useParams();
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get('agentId');

  if (agentId) {
    return <WorkflowGraphFromAgent agentId={agentId} workflowId={workflowId!} />;
  }

  return <WorkflowGraphWrapper workflowId={workflowId!} />;
};

const WorkflowGraphWrapper = ({ workflowId }: { workflowId: string }) => {
  const navigate = useNavigate();

  return (
    <WorkflowGraph
      workflowId={workflowId!}
      onShowTrace={({ runId, stepName }) => {
        navigate(`/workflows/${workflowId}/traces?runId=${runId}&stepName=${stepName}`);
      }}
    />
  );
};

const WorkflowGraphFromAgent = ({ agentId, workflowId }: { agentId: string; workflowId: string }) => {
  const [isValidWorkflow, setIsValidWorkflow] = useState(false);

  useEffect(() => {
    const fetchAgent = async () => {
      const details = await client.getAgent(agentId).details();
      const workflowIds = Object.keys(details.workflows);

      console.log('lol', workflowIds, workflowId);

      const isSameId = workflowIds.find(id => id === workflowId);

      const res = await client.getWorkflow(workflowId);

      console.log('resOOOOO', res);

      setIsValidWorkflow(Boolean(isSameId));
    };
    fetchAgent();
  }, [agentId, workflowId]);

  if (!isValidWorkflow) {
    return <div>Workflow not found</div>;
  }

  return <WorkflowGraphWrapper workflowId={workflowId} />;
};
