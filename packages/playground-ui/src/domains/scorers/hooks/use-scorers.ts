import { useMastraClient } from '@/contexts/mastra-client-context';
import { ScoringEntityType } from '@mastra/core';
import { useState } from 'react';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { GetScorerResponse } from '@mastra/client-js';

export interface UseScorersProps {
  entityId: string;
  entityType: ScoringEntityType;
}

export const useScorers = ({ entityId, entityType }: UseScorersProps) => {
  const client = useMastraClient();
  const [scorers, setScorers] = useState<GetScorerResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchScorers = async () => {
      setIsLoading(true);
      try {
        const res = await client.getScorers();

        const scorersKey = Object.keys(res);
        const agentScorers = scorersKey.filter(key => res[key].agentIds.includes(entityId)).map(key => res[key]);

        setScorers(agentScorers);
      } catch (error) {
        setScorers([]);
        console.error('Error fetching scorers', error);
        toast.error('Error fetching scorers');
      } finally {
        setIsLoading(false);
      }
    };

    fetchScorers();
  }, [entityId, entityType]);

  return { scorers, isLoading };
};
