import { WorkflowIcon } from 'lucide-react';
import { MemoryIcon, SettingsIcon, ToolsIcon } from '@/ds/icons';
import { Txt } from '@/ds/components/Txt';
import { PanelSection, PanelBadges, PanelContent, PanelKeyValueList } from '../elements';
import { useContext } from 'react';
import { AgentContext } from '@/domains/agents';

type AgentPanelDefaultProps = {
  // className?: string;
  // style?: React.CSSProperties;
  agentId?: string;
  agent?: any;
  memory?: any;
  toggleContent: () => void;
};

export function AgentPanelDefault({ agentId, memory, agent, toggleContent }: AgentPanelDefaultProps) {
  const { modelSettings, chatWithGenerate } = useContext(AgentContext);

  const toolBadges = Object.entries(agent?.tools ?? {}).map(([toolKey, tool]) => ({
    name: toolKey,
    icon: <ToolsIcon />,
  }));

  const workflowBadges = Object.entries(agent?.workflows ?? {}).map(([workflowKey, workflow]) => ({
    name: workflowKey,
    icon: <WorkflowIcon />,
  }));

  const modelBadges = [
    {
      name: agent?.provider?.split('.')[0],
    },
    { name: agent?.modelId },
  ];

  const memoryBadges = [
    {
      name: memory?.result ? 'Memory is On' : 'Memory is Off',
      icon: <MemoryIcon />,
    },
  ];

  const formattedInstructions = agent?.instructions
    .split('\n')
    // @ts-expect-error
    .map(line => line.trim())
    .join('\n');

  if (!agentId || !agent) {
    return null; // or handle loading state
  }

  return (
    <PanelContent>
      <PanelSection title="Memory" href="https://mastra.ai/en/docs/agents/agent-memory">
        <PanelBadges badges={memoryBadges} />
      </PanelSection>
      <PanelSection title="Model">
        <PanelBadges badges={modelBadges} />
      </PanelSection>
      <PanelSection title="Tools" href="https://mastra.ai/en/docs/agents/using-tools-and-mcp">
        <PanelBadges badges={toolBadges} />
      </PanelSection>
      <PanelSection title="Workflows" href="https://mastra.ai/en/docs/workflows/overview">
        <PanelBadges badges={workflowBadges} />
      </PanelSection>
      <PanelSection title="System prompt">
        <Txt
          as="p"
          variant="ui-md"
          className="bg-surface4 text-icon6 whitespace-pre-wrap rounded-lg px-2 py-1.5 text-sm"
        >
          {formattedInstructions}
        </Txt>
      </PanelSection>
      <PanelSection
        title="Settings"
        action={{ label: 'Customize', onAction: () => toggleContent(), icon: <SettingsIcon /> }}
      >
        <PanelKeyValueList
          items={[
            {
              key: 'Chat method',
              value: chatWithGenerate ? 'generate' : 'stream',
            },
            { key: 'Temperature', value: modelSettings?.temperature?.toString() || '' },
            { key: 'Top P', value: modelSettings?.topP?.toString() || '' },
            { key: 'Top K', value: modelSettings?.topK?.toString() || '' },
            { key: 'Frequency Penalty', value: modelSettings?.frequencyPenalty?.toString() || '' },
            { key: 'Presence Penalty', value: modelSettings?.presencePenalty?.toString() || '' },
            { key: 'Max tokens', value: modelSettings?.maxTokens?.toString() || '' },
            { key: 'Max steps', value: modelSettings?.maxSteps?.toString() || '' },
            { key: 'Max Retries', value: modelSettings?.maxRetries?.toString() || '' },
          ]}
        />
      </PanelSection>
      <PanelSection title="Endpoints">
        <PanelKeyValueList
          items={[
            { key: 'GET', value: '/api/agents' },
            { key: 'GET', value: `/api/agents/${agentId}` },
            { key: 'GET', value: `/api/agents/${agentId}/evals//ci` },
            { key: 'GET', value: `/api/agents/${agentId}/evals/live` },
            { key: 'POST', value: `/api/agents/${agentId}/instructions` },
            { key: 'POST', value: `/api/agents/${agentId}/generate` },
            { key: 'POST', value: `/api/agents/${agentId}/generate` },
            { key: 'POST', value: `/api/agents/${agentId}/stream` },
            { key: 'POST', value: `/api/agents/${agentId}/text-object` },
            { key: 'POST', value: `/api/agents/${agentId}/stream-object` },
          ]}
        />
      </PanelSection>
    </PanelContent>
  );
}
