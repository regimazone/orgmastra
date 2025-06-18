import { useWorkflows } from '@/hooks/use-workflows';
import {
  Button,
  DataTable,
  EmptyState,
  Header,
  HeaderTitle,
  Icon,
  WorkflowCoinIcon,
  WorkflowIcon,
  MainContentLayout,
  MainContentContent,
  MainLayout,
  MainContent,
  MainHeader,
  MainHeaderTitle,
  MainList,
} from '@mastra/playground-ui';
import { Footprints } from 'lucide-react';
import { workflowsTableColumns } from '@/domains/workflows/table.columns';
import { useNavigate } from 'react-router';
import { useNewUI } from '@/hooks/use-new-ui';
import { Link } from 'react-router';

function Workflows() {
  const navigate = useNavigate();
  const { data, isLoading } = useWorkflows();
  const [legacyWorkflows, workflows] = data ?? [];

  const newUIEnabled = useNewUI();

  const legacyWorkflowList = Object.entries(legacyWorkflows ?? {}).map(([key, workflow]) => ({
    id: key,
    name: workflow.name,
    stepsCount: Object.keys(workflow.steps)?.length,
    isLegacy: true,
  }));

  const workflowList = Object.entries(workflows ?? {}).map(([key, workflow]) => ({
    id: key,
    name: workflow.name,
    stepsCount: Object.keys(workflow.steps ?? {})?.length,
    isLegacy: false,
  }));

  const allWorkflows = [...workflowList, ...legacyWorkflowList];

  const workflowListItems = allWorkflows.map(workflow => ({
    id: workflow.id,
    name: workflow.name,
    icon: <WorkflowIcon />,
    to: `/workflows${workflow.isLegacy ? '/legacy' : ''}/${workflow.id}/graph`,
    columns: [
      <>
        <Footprints />
        {workflow.stepsCount} steps
      </>,
    ],
  }));

  const workflowListColumns = [{ key: 'actions', label: 'Actions', minWidth: '10rem', maxWidth: '15rem' }];

  return newUIEnabled ? (
    <MainLayout>
      <MainHeader>
        <MainHeaderTitle>Workflows</MainHeaderTitle>
      </MainHeader>
      <MainContent>
        <MainList
          items={workflowListItems}
          linkComponent={Link}
          columns={workflowListColumns}
          isLoading={isLoading}
          emptyStateFor="workflows"
        />
      </MainContent>
    </MainLayout>
  ) : (
    <MainContentLayout>
      <Header>
        <HeaderTitle>Workflows</HeaderTitle>
      </Header>

      {workflowList.length === 0 ? (
        <MainContentContent isCentered={true}>
          <EmptyState
            iconSlot={<WorkflowCoinIcon />}
            titleSlot="Configure Workflows"
            descriptionSlot="Mastra workflows are not configured yet. You can find more information in the documentation."
            actionSlot={
              <Button
                size="lg"
                className="w-full"
                variant="light"
                as="a"
                href="https://mastra.ai/en/docs/workflows/overview"
                target="_blank"
              >
                <Icon>
                  <WorkflowIcon />
                </Icon>
                Docs
              </Button>
            }
          />
        </MainContentContent>
      ) : (
        <MainContentContent>
          <DataTable
            emptyText="Workflows"
            columns={workflowsTableColumns}
            data={[...workflowList, ...legacyWorkflowList]}
            onClick={row => navigate(`/workflows${row.isLegacy ? '/legacy' : ''}/${row.id}/graph`)}
          />
        </MainContentContent>
      )}
    </MainContentLayout>
  );
}

export default Workflows;
