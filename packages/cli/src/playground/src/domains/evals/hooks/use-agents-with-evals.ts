import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { client } from '@/lib/client';
import type { GetAgentResponse } from '@mastra/client-js';
import type { Evals } from './use-evals-by-agent-id';

export type AgentWithEvals = {
  id: string;
  name: string;
  description: string;
  provider: string;
  modelId: string;
  liveEvalsCount: number;
  ciEvalsCount: number;
  totalEvalsCount: number;
  lastEvalDate?: string;
  averageScore?: number;
  liveEvals: Evals[];
  ciEvals: Evals[];
};

export const useAgentsWithEvals = () => {
  const [agentsWithEvals, setAgentsWithEvals] = useState<AgentWithEvals[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAgentsWithEvals = async () => {
      setIsLoading(true);
      try {
        // First get all agents
        const agents = await client.getAgents();
        
        // Then fetch eval data for each agent
        const agentsWithEvalsData = await Promise.all(
          Object.entries(agents).map(async ([agentId, agent]: [string, any]) => {
            try {
              const [liveEvalsResponse, ciEvalsResponse] = await Promise.all([
                client.getAgent(agentId).liveEvals(),
                client.getAgent(agentId).evals(),
              ]);

              const liveEvals = liveEvalsResponse.evals || [];
              const ciEvals = ciEvalsResponse.evals || [];
              const allEvals = [...liveEvals, ...ciEvals];

              // Calculate metrics
              const totalEvalsCount = allEvals.length;
              const lastEvalDate = allEvals.length > 0 
                ? allEvals.reduce((latest, eval_) => 
                    new Date(eval_.createdAt) > new Date(latest) ? eval_.createdAt : latest
                  , allEvals[0].createdAt)
                : undefined;

              const averageScore = allEvals.length > 0
                ? allEvals.reduce((sum, eval_) => sum + eval_.result.score, 0) / allEvals.length
                : undefined;

              return {
                id: agentId,
                name: agent.name,
                description: agent.instructions,
                provider: agent.provider,
                modelId: agent.modelId,
                liveEvalsCount: liveEvals.length,
                ciEvalsCount: ciEvals.length,
                totalEvalsCount,
                lastEvalDate,
                averageScore,
                liveEvals,
                ciEvals,
              };
            } catch (error) {
              console.error(`Error fetching evals for agent ${agentId}:`, error);
              return {
                id: agentId,
                name: agent.name,
                description: agent.instructions,
                provider: agent.provider,
                modelId: agent.modelId,
                liveEvalsCount: 0,
                ciEvalsCount: 0,
                totalEvalsCount: 0,
                liveEvals: [],
                ciEvals: [],
              };
            }
          })
        );

        // Filter out agents with no evals and sort by total evals count
        const filteredAgents = agentsWithEvalsData
          .filter(agent => agent.totalEvalsCount > 0)
          .sort((a, b) => b.totalEvalsCount - a.totalEvalsCount);

        setAgentsWithEvals(filteredAgents);
      } catch (error) {
        console.error('Error fetching agents with evals:', error);
        toast.error('Error fetching evaluation data');
        setAgentsWithEvals([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgentsWithEvals();
  }, []);

  return { agentsWithEvals, isLoading };
};