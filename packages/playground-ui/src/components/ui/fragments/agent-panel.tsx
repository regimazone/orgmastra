import { AgentIcon } from '@/ds/icons';
import { PanelLayout, PanelHeader } from '../elements';
import { AgentPanelDefault, AgentPanelEditor } from '../fragments';
import { useState } from 'react';

import * as Tabs from '@radix-ui/react-tabs';

type AgentPanelProps = {
  className?: string;
  style?: React.CSSProperties;
  Link?: any;
  agentId?: string;
  agent?: any; // Replace with actual agent type
  memory?: any; // Replace with actual memory type
};

export function AgentPanel({ agentId, agent, memory, className, style, Link }: AgentPanelProps) {
  const [contentVariant, setContentVariant] = useState<'default' | 'editor'>('default');

  const toggleContent = () => {
    setContentVariant(prev => (prev === 'default' ? 'editor' : 'default'));
  };

  if (!agentId || !agent) {
    return null; // or handle loading state
  }

  return (
    <PanelLayout>
      <PanelHeader icon={<AgentIcon />} title={agent?.name} />
      <Tabs.Root value={contentVariant}>
        <Tabs.Content value="default">
          <AgentPanelDefault agent={agent} agentId={agentId} toggleContent={toggleContent} />
        </Tabs.Content>
        <Tabs.Content value="editor">
          <AgentPanelEditor agent={agent} agentId={agentId} toggleContent={toggleContent} />
        </Tabs.Content>
      </Tabs.Root>
    </PanelLayout>
  );
}
