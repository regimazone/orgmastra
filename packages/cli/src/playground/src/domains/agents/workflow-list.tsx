import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflow } from '@/hooks/use-workflows';
import {
  Entity,
  EntityContent,
  EntityDescription,
  EntityIcon,
  EntityName,
  Icon,
  WorkflowIcon,
  Spinner,
} from '@mastra/playground-ui';
import { ExternalLink, EyeOff, Info } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';

export interface WorkflowListProps {
  workflows: Array<{ id: string; description: string }>;
}

export function WorkflowList({ workflows }: WorkflowListProps) {
  return (
    <ul className="space-y-2">
      {workflows.map(workflow => (
        <li key={workflow.id}>
          <WorkflowEntity workflowId={workflow.id} description={workflow.description} />
        </li>
      ))}
    </ul>
  );
}

interface WorkflowEntityProps {
  workflowId: string;
  description: string;
}

const WorkflowEntity = ({ workflowId, description }: WorkflowEntityProps) => {
  const { isLoading, data: workflow } = useWorkflow(workflowId);

  const linkRef = useRef<HTMLAnchorElement>(null);

  const handleClick = () => {
    linkRef.current?.click();
  };

  const shouldResolveLink = Boolean(!isLoading && workflow);

  return (
    <Entity onClick={shouldResolveLink ? handleClick : undefined} className="flex items-center gap-2">
      <EntityIcon>
        <WorkflowIcon className="group-hover/entity:text-accent3" />
      </EntityIcon>
      <EntityContent>
        <EntityName>{workflowId}</EntityName>
        <EntityDescription className="flex items-center justify-between gap-2 w-full">{description}</EntityDescription>
      </EntityContent>

      <div className="text-icon3 text-xs ml-auto">
        <Icon>
          {isLoading ? (
            <Spinner />
          ) : workflow ? (
            <Link ref={linkRef} to={`/workflows/${workflowId}/graph`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <EyeOff className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                <Icon size="sm">
                  <Info />
                </Icon>
                Workflows that are not registered at the Mastra class level are not available in the UI.
              </TooltipContent>
            </Tooltip>
          )}
        </Icon>
      </div>
    </Entity>
  );
};
