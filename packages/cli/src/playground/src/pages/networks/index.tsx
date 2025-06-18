import {
  AgentNetworkCoinIcon,
  Button,
  DataTable,
  EmptyState,
  Header,
  HeaderTitle,
  Icon,
  MainContentLayout,
  MainContentContent,
  MainLayout,
  MainContent,
  MainHeader,
  MainHeaderTitle,
  MainList,
} from '@mastra/playground-ui';
import { UsersIcon, BrainIcon } from 'lucide-react';
import { useNetworks } from '@/hooks/use-networks';
import { networksTableColumns } from '@/domains/networks/table.columns';
import { NetworkIcon } from 'lucide-react';
import { useNewUI } from '@/hooks/use-new-ui';
import { Link } from 'react-router';
import { GetNetworkResponse } from '@mastra/client-js';

function Networks() {
  const { networks, isLoading } = useNetworks();
  const newUIEnabled = useNewUI();

  const networkListColumns = [
    { key: 'agents', label: 'Agents', minWidth: '6rem' },
    { key: 'routingModel', label: 'Routing Model' },
  ];

  type Network = GetNetworkResponse & { id: string };
  const networkListItems = (networks as Network[]).map(network => ({
    id: network.id,
    icon: <NetworkIcon />,
    name: network.name,
    description: network.instructions,
    to: `/networks/${network.id}/chat`,
    columns: [
      <>
        <UsersIcon /> {network.agents.length}
      </>,
      <>
        <BrainIcon /> {network.routingModel.modelId}
      </>,
    ],
  }));

  return newUIEnabled ? (
    <MainLayout>
      <MainHeader>
        <MainHeaderTitle>Networks</MainHeaderTitle>
      </MainHeader>
      <MainContent>
        <MainList
          items={networkListItems}
          linkComponent={Link}
          columns={networkListColumns}
          emptyStateFor="networks"
          isLoading={isLoading}
        />
      </MainContent>
    </MainLayout>
  ) : (
    <MainContentLayout>
      <Header>
        <HeaderTitle>Networks</HeaderTitle>
      </Header>

      {networks.length === 0 ? (
        <MainContentContent isCentered={true}>
          <EmptyState
            iconSlot={<AgentNetworkCoinIcon />}
            titleSlot="Configure Agent Networks"
            descriptionSlot="Mastra agent networks are not configured yet. You can find more information in the documentation."
            actionSlot={
              <Button
                size="lg"
                className="w-full"
                variant="light"
                as="a"
                href="https://mastra.ai/en/reference/networks/agent-network"
                target="_blank"
              >
                <Icon>
                  <NetworkIcon />
                </Icon>
                Docs
              </Button>
            }
          />
        </MainContentContent>
      ) : (
        <MainContentContent>
          <DataTable isLoading={isLoading} data={networks} columns={networksTableColumns} />
        </MainContentContent>
      )}
    </MainContentLayout>
  );
}

export default Networks;
