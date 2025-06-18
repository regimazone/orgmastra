import { useParams, Link } from 'react-router';

import { Skeleton } from '@/components/ui/skeleton';

import { useNetwork } from '@/hooks/use-networks';
import { useNewUI } from '@/hooks/use-new-ui';

import { NetworkHeader } from './network-header';
import { Header, HeaderTitle, MainContentLayout, MainLayout, MainHeader, MainNavbar } from '@mastra/playground-ui';
const newUIEnabled = useNewUI();

export const NetworkLayout = ({ children }: { children: React.ReactNode }) => {
  const { networkId } = useParams();
  const { network, isLoading: isNetworkLoading } = useNetwork(networkId!);
  return newUIEnabled ? (
    <MainLayout>
      <MainHeader>
        <MainNavbar
          linkComponent={Link}
          breadcrumbItems={[
            { label: 'Networks', to: '/networks' },
            { label: network?.name || '', to: `/networks/${networkId}`, isCurrent: true },
          ]}
          navItems={[[{ label: 'Chat', to: `/networks/${networkId}` }]]}
        />
      </MainHeader>
      {children}
    </MainLayout>
  ) : (
    <MainContentLayout>
      {isNetworkLoading ? (
        <Header>
          <HeaderTitle>
            <Skeleton className="h-6 w-[200px]" />
          </HeaderTitle>
        </Header>
      ) : (
        <NetworkHeader networkName={network?.name!} networkId={networkId!} />
      )}
      {children}
    </MainContentLayout>
  );
};
