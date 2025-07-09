import { useScorers } from '../hooks/use-scorers';
import { Skeleton } from '@/components/ui/skeleton';
import { Entry } from '@/components/ui/entry';
import { GetScorerResponse } from '@mastra/client-js';
import { Slider } from '@/components/ui/slider';
import { Txt } from '@/ds/components/Txt';
import { Button } from '@/ds/components/Button';
import { Icon } from '@/ds/icons';
import { RefreshCw } from 'lucide-react';
import { useScorerSettings } from '@/domains/scorers';

export const ScorerSettings = () => {
  const { entityType, entityId, resetEntitySettings } = useScorerSettings();
  const { scorers: scorersData, isLoading } = useScorers({ entityId, entityType });

  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (scorersData.length === 0)
    return (
      <Txt as="p" variant="ui-sm" className="text-icon3">
        No scorers found. You can configure scorers by following the{' '}
        <a href="https://mastra.ai/docs" target="_blank" rel="noopener noreferrer" className="text-icon6 underline">
          documentation guide
        </a>
        .
      </Txt>
    );

  return (
    <div>
      <ul className="space-y-4">
        {scorersData.map((scorer, index) => (
          <li key={`${scorer.scorer.name}-${index}`} className="w-1/2 pr-4">
            <ScorerSettingsItem scorer={scorer} />
          </li>
        ))}
      </ul>

      <div className="py-5">
        <Button onClick={resetEntitySettings} variant="light" className="w-full" size="lg">
          <Icon>
            <RefreshCw />
          </Icon>
          Reset
        </Button>
      </div>
    </div>
  );
};

interface ScorerSettingsItemProps {
  scorer: GetScorerResponse;
}

const ScorerSettingsItem = ({ scorer }: ScorerSettingsItemProps) => {
  const { entitySettings, setEntitySettings } = useScorerSettings();
  const scorerSettings = entitySettings?.[scorer.scorer.name];

  const samplingRate = scorerSettings?.sampling?.rate || 0;

  const handleSamplingRateChange = (nextValues: number[]) => {
    setEntitySettings(scorer.scorer.name, {
      sampling: { type: 'ratio', rate: nextValues[0] },
    });
  };

  return (
    <div>
      {scorer.scorer.name}
      <Entry label="Sampling Rate">
        <div className="flex flex-row justify-between items-center gap-2">
          <Slider
            onValueChange={handleSamplingRateChange}
            value={[samplingRate]}
            max={1}
            min={0}
            step={0.1}
            defaultValue={[scorer.sampling?.type === 'ratio' ? scorer.sampling?.rate : 0]}
          />

          <Txt as="p" variant="ui-sm" className="text-icon3">
            {samplingRate}
          </Txt>
        </div>
      </Entry>
    </div>
  );
};
