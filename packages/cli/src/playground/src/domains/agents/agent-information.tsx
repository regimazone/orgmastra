import { useAgent } from '@/hooks/use-agents';
import { AgentLogs } from './agent-logs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AgentSettings,
  PlaygroundTabs,
  Tab,
  TabContent,
  TabList,
  AgentMetadata,
  AgentEntityHeader,
} from '@mastra/playground-ui';

import { useMemory } from '@/hooks/use-memory';
import { AgentWorkingMemory } from './agent-working-memory';
import { AgentPromptEnhancer } from './agent-instructions-enhancer';

export function AgentInformation({ agentId }: { agentId: string }) {
  const { agent, isLoading } = useAgent(agentId);
  const { memory, isLoading: isMemoryLoading } = useMemory(agentId);

  return (
    <div className="grid grid-rows-[auto_1fr] h-full items-start overflow-y-auto border-l-sm border-border1">
      <AgentEntityHeader agentId={agentId} isLoading={isMemoryLoading} agentName={agent?.name || ''} />

      <div className="overflow-y-auto border-t-sm border-border1">
        <PlaygroundTabs defaultTab="overview">
          <TabList>
            <Tab value="overview">Overview</Tab>
            <Tab value="model-settings">Model Settings</Tab>
            <Tab value="logs">Log Drains</Tab>
            <Tab value="working-memory">Working Memory</Tab>
          </TabList>

<<<<<<< HEAD
          <Badge className="capitalize shrink-0" icon={providerIcon}>
            {agent?.provider?.split('.')[0]}
          </Badge>

          <Badge className="shrink-0">{agent?.modelId}</Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Badge icon={<MemoryIcon />} variant={memory?.result ? 'success' : 'error'} className="shrink-0">
                {memory?.result ? 'Memory is On' : 'Memory is Off'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {memory?.result ? (
                'Memory is active, your messages will be persisted.'
              ) : (
                <>
                  <p>Memory is off, your messages will not be persisted neither available in the context.</p>
                  <p>
                    <Link to="https://mastra.ai/en/docs/memory/overview" target="_blank" className="underline">
                      See documentation to enable memory
                    </Link>
                  </p>
                </>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Tabs defaultValue="overview" className="overflow-y-auto grid grid-rows-[auto_1fr] h-full">
        <TabsList className="flex border-b overflow-x-auto pl-5">
          <TabsTrigger value="overview" className="group">
            <p className="text-xs p-3 text-mastra-el-3 group-data-[state=active]:text-mastra-el-5 group-data-[state=active]:border-b-2 group-data-[state=active]:pb-2.5 border-white">
              Overview
            </p>
          </TabsTrigger>

          <TabsTrigger value="settings" className="group">
            <p className="text-xs p-3 text-mastra-el-3 group-data-[state=active]:text-mastra-el-5 group-data-[state=active]:border-b-2 group-data-[state=active]:pb-2.5 border-white">
              Settings
            </p>
          </TabsTrigger>

          <TabsTrigger value="endpoints" className="group">
            <p className="text-xs p-3 text-mastra-el-3 group-data-[state=active]:text-mastra-el-5 group-data-[state=active]:border-b-2 group-data-[state=active]:pb-2.5 border-white">
              Endpoints
            </p>
          </TabsTrigger>
          <TabsTrigger value="logs" className="group ">
            <p className="text-xs p-3 text-mastra-el-3 group-data-[state=active]:text-mastra-el-5 group-data-[state=active]:border-b-2 group-data-[state=active]:pb-2.5 border-white">
              Log&nbsp;Drains
            </p>
          </TabsTrigger>
          <TabsTrigger value="working-memory" className="group">
            <p className="text-xs p-3 text-mastra-el-3 group-data-[state=active]:text-mastra-el-5 group-data-[state=active]:border-b-2 group-data-[state=active]:pb-2.5 border-white">
              Working Memory
            </p>
          </TabsTrigger>
        </TabsList>

        <div className="overflow-y-auto">
          <TabsContent value="overview">
            {isLoading && <Skeleton className="h-full" />}
            {agent && <AgentOverview agent={agent} agentId={agentId} />}
          </TabsContent>
          <TabsContent value="settings">
=======
          <TabContent value="overview">
            {isLoading && <Skeleton className="h-full" />}
            {agent && (
              <AgentMetadata
                agent={agent}
                hasMemoryEnabled={Boolean(memory?.result)}
                computeToolLink={tool => `/tools/${agentId}/${tool.id}`}
                computeWorkflowLink={workflow => `/workflows/${workflow.name}/graph`}
                promptSlot={<AgentPromptEnhancer agentId={agentId} />}
              />
            )}
          </TabContent>
          <TabContent value="model-settings">
>>>>>>> 8ee246917cc68a1176b8eb21e1e155debc6d6ec2
            {isLoading && <Skeleton className="h-full" />}
            {agent && <AgentSettings />}
          </TabContent>

          <TabContent value="logs">
            {isLoading ? <Skeleton className="h-full" /> : <AgentLogs agentId={agentId} />}
          </TabContent>
          <TabContent value="working-memory">
            {isLoading ? <Skeleton className="h-full" /> : <AgentWorkingMemory />}
          </TabContent>
        </PlaygroundTabs>
      </div>
    </div>
  );
}
