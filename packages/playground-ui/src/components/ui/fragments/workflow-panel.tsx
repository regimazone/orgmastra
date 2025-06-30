import { WorkflowIcon } from '@/ds/icons';
import { AgentIcon, MemoryIcon, ToolsIcon } from '@/ds/icons';
import { Txt } from '@/ds/components/Txt';
import { PanelSection, PanelBadges, PanelLayout, PanelHeader, PanelContent } from '../elements';

type WorkflowPanelProps = {
  className?: string;
  style?: React.CSSProperties;
  Link?: any;
  workflow: any; // Replace with actual type
};

export function WorkflowPanel({ workflow, className, style, Link }: WorkflowPanelProps) {
  return (
    <PanelLayout>
      <PanelHeader icon={<WorkflowIcon />} title={workflow?.name} />
      <PanelContent></PanelContent>
    </PanelLayout>
  );
}
