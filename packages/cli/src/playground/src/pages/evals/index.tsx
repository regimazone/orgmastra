import {
  DataTable,
  EmptyState,
  Header,
  HeaderTitle,
  MainContentLayout,
  MainContentContent,
  Button,
  Icon,
} from '@mastra/playground-ui';
import { TestTube } from 'lucide-react';

import { useAgentsWithEvals } from '@/domains/evals/hooks/use-agents-with-evals';
import { evalsTableColumns } from '@/domains/evals/table.columns';
import { useNavigate } from 'react-router';

function Evals() {
  const navigate = useNavigate();
  const { agentsWithEvals, isLoading } = useAgentsWithEvals();

  if (isLoading) return null;

  return (
    <MainContentLayout>
      <Header>
        <HeaderTitle>Evaluations</HeaderTitle>
      </Header>

      {agentsWithEvals.length === 0 ? (
        <MainContentContent isCentered={true}>
          <EmptyState
            iconSlot={<TestTube className="h-12 w-12" />}
            titleSlot="No Evaluations Found"
            descriptionSlot="No evaluation data is available yet. Run some evaluations on your agents to see results here."
            actionSlot={
              <Button
                size="lg"
                className="w-full"
                variant="light"
                as="a"
                href="https://mastra.ai/en/docs/evals"
                target="_blank"
              >
                <Icon>
                  <TestTube />
                </Icon>
                Learn about Evals
              </Button>
            }
          />
        </MainContentContent>
      ) : (
        <MainContentContent>
          <DataTable
            columns={evalsTableColumns}
            data={agentsWithEvals}
            onClick={row => navigate(`/agents/${row.id}/evals`)}
          />
        </MainContentContent>
      )}
    </MainContentLayout>
  );
}

export default Evals;