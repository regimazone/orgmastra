import { useLogsByRunId } from '@/hooks/use-logs';
import { Header, Icon, LogsIcon, WorkflowLogs } from '@mastra/playground-ui';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

export interface WorkflowLogsContainerProps {
  runId: string;
}

export const WorkflowLogsContainer = ({ runId }: WorkflowLogsContainerProps) => {
  const [expanded, setExpanded] = useState(true);
  const { open } = useSidebar();
  const { data: logs = [], isLoading } = useLogsByRunId(runId);

  return (
    <div
      className={clsx(
        'z-20 fixed  bg-surface3 border-t-sm border-border1 transition-all duration-300 right-[13px] overflow-hidden rounded-b-lg',
        expanded ? 'translate-y-0 h-1/2 bottom-3' : 'translate-y-[calc(100%-32px)] h-content bottom-5',
        open ? 'left-[173px]' : 'left-14',
      )}
    >
      <Header>
        <LogsIcon />
        <button
          className="text-left w-full h-full flex items-center justify-between"
          onClick={() => setExpanded(s => !s)}
        >
          Logs
          <Icon>
            <ChevronDown className={clsx('transition-transform text-icon3', expanded ? 'rotate-0' : 'rotate-180')} />
          </Icon>
        </button>
      </Header>

      {expanded && (
        <div className={'overflow-y-auto h-full'}>
          <WorkflowLogs logs={logs || []} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
};
