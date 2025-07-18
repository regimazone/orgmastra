import { cn } from '@/lib/utils';
import { GetAgentResponse } from '@mastra/client-js';

import { Button, FormActions, InputField, SelectField, TextareaField, useAgentSettings } from '@mastra/playground-ui';
import { CircleAlertIcon } from 'lucide-react';

import { useState } from 'react';

export interface AgentDetailsProps {
  agent: GetAgentResponse;
  agentId: string;
}

export const AgentDetails = ({ agent, agentId }: AgentDetailsProps) => {
  const { settings, setSettings, resetAll } = useAgentSettings();
  const modelSettings = settings?.modelSettings || {};
  const [currentVersion, setCurrentVersion] = useState('latest');
  const [isEditing, setIsEditing] = useState(false);
  const [isChanged, setIsChanged] = useState(false);

  const configItems = [
    { key: 'Temperature', value: modelSettings?.temperature?.toString() || '' },
    { key: 'Top P', value: modelSettings?.topP?.toString() || '' },
    { key: 'Top K', value: modelSettings?.topK?.toString() || '' },
    { key: 'Frequency Penalty', value: modelSettings?.frequencyPenalty?.toString() || '' },
    { key: 'Presence Penalty', value: modelSettings?.presencePenalty?.toString() || '' },
    { key: 'Max tokens', value: modelSettings?.maxTokens?.toString() || '' },
    { key: 'Max steps', value: modelSettings?.maxSteps?.toString() || '' },
    { key: 'Max Retries', value: modelSettings?.maxRetries?.toString() || '' },
  ];

  const formattedInstructions = agent?.instructions
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  return (
    <div className="p-[1.5rem] grid text-[0.875rem]">
      {isEditing ? (
        <div>
          <TextareaField
            label="Instructions"
            value={formattedInstructions}
            onChange={e => setIsChanged(true)}
            className="mb-4"
          />
          <InputField label="Temperature" value={modelSettings?.temperature} />
          <InputField label="Temperature" value={modelSettings?.temperature} />
          <InputField label="Top P" value={modelSettings?.topP} />
          <InputField label="Top K" value={modelSettings?.topK} />
          <InputField label="Frequency Penalty" value={modelSettings?.frequencyPenalty} />
          <InputField label="Presence Penalty" value={modelSettings?.presencePenalty} />
          <InputField label="Max tokens" value={modelSettings?.maxTokens} />
          <InputField label="Max steps" value={modelSettings?.maxSteps} />
          <InputField label="Max Retries" value={modelSettings?.maxRetries} />
          {isChanged && (
            <div
              className={cn(
                'text-[0.875rem] bg-surface5 mt-[1.5rem] p-[1.5rem] rounded-lg',
                '[&>svg]:inline [&>svg]:text-orange-500 [&>svg]:h-[1.2em] [&>svg]:w-[1.2em] [&>svg]:float-left [&>svg]:mr-[0.5rem] [&>svg]:mb-[0.25rem]',
              )}
            >
              <CircleAlertIcon /> The Agent settings have been changed. You can save them as a new version or cancel the
              changes.
            </div>
          )}

          <div
            className={cn(
              'grid grid-cols-[2fr_auto] gap-[1rem] mt-[1.5rem]',
              '[&>button]:min-h-[2.25rem] [&>button]:text-[0.875rem] [&>button]:px-[1.5rem] [&>button]:py-[.5rem] [&>button]:rounded-lg [&>button]:bg-surface3 [&>button]:text-icon6 [&>button]:hover:bg-surface4 [&>button]:focus:bg-surface4 [&>button]:focus:outline-none [&>button]:focus:ring-2 [&>button]:focus:ring-offset-2 [&>button]:focus:ring-offset-surface3 [&>button]:focus:ring-icon6',
            )}
          >
            <Button
              onClick={() => {
                setIsEditing(false);
              }}
              className=""
            >
              Save as new version
            </Button>
            <Button onClick={() => setIsEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-[1rem] items-end  pb-[1.5rem]">
            <SelectField
              name="select-version"
              label="Current Version"
              value={currentVersion}
              onChange={v => setCurrentVersion(v)}
              options={[
                {
                  label: 'Latest',
                  value: 'latest',
                },
                {
                  label: 'Version 1.0',
                  value: '1.2',
                },
                {
                  label: 'Version 1.0',
                  value: '1.0',
                },
              ]}
            />

            <Button onClick={() => setIsEditing(true)} className="min-h-[2.25rem] text-[0.875rem]">
              Customize
            </Button>
          </div>

          <span className="pb-[1rem]">Instructions</span>
          <div className="">{formattedInstructions}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-4 mt-4">
            {configItems.map(item => (
              <>
                <dt className="text-icon3">{item.key}</dt>
                <dd className="text-icon6">{item.value || 'n/a'}</dd>
              </>
            ))}
          </dl>
        </>
      )}
    </div>
  );
};
