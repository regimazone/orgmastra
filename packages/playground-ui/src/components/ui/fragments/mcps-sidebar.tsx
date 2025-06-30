import { PanelLayout, PanelHeader, EntryList, PanelContent } from '@/components/ui/elements';
import { type EntryListItemType } from '@/components/ui/types';
import { McpServerIcon, ToolsIcon } from '@/ds/icons';

export type McpsSidebarProps = {
  className?: string;
  style?: React.CSSProperties;
  linkComponent?: React.ComponentType<any>;
  tools?: EntryListItemType[];
};

export function McpsSidebar({ tools, linkComponent, className, style }: McpsSidebarProps) {
  return (
    <PanelLayout>
      <PanelHeader title="Available tools" icon={<McpServerIcon />} />
      <PanelContent>
        <EntryList items={tools} linkComponent={linkComponent} />
      </PanelContent>
    </PanelLayout>
  );
}
