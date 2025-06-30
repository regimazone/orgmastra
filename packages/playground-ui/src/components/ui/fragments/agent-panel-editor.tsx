import { WorkflowIcon } from 'lucide-react';
import { MemoryIcon, SettingsIcon, ToolsIcon } from '@/ds/icons';
import { Txt } from '@/ds/components/Txt';
import { PanelSection, PanelBadges, PanelContent, PanelKeyValueList, RadioGroup, RadioGroupItem } from '../elements';
import { useContext } from 'react';
import { AgentContext } from '@/domains/agents';
import { Button } from '@/ds/components/Button';
import { Label } from '../label';
import { Input } from '../input';

type AgentPanelEditorProps = {
  // className?: string;
  // style?: React.CSSProperties;
  agentId?: string;
  agent?: any;
  memory?: any;
  toggleContent: () => void;
};

export function AgentPanelEditor({ agentId, memory, agent, toggleContent }: AgentPanelEditorProps) {
  const { modelSettings, setModelSettings, chatWithGenerate, setChatWithGenerate } = useContext(AgentContext);

  return (
    <PanelContent>
      <div className="px-5 text-xs py-2 pb-4">
        <div>
          <RadioGroup
            orientation="horizontal"
            value={chatWithGenerate ? 'generate' : 'stream'}
            onValueChange={value => setChatWithGenerate(value === 'generate')}
            className="flex flex-row gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="generate" id="generate" className="text-icon6" />
              <Label className="text-icon6 text-ui-md" htmlFor="generate">
                Generate
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="stream" id="stream" className="text-icon6" />
              <Label className="text-icon6 text-ui-md" htmlFor="stream">
                Stream
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-1">
          <Txt as="label" className="text-icon3" variant="ui-sm">
            Top K
          </Txt>
          <Input
            type="number"
            value={modelSettings?.topK}
            onChange={e =>
              setModelSettings({ ...modelSettings, topK: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>

        <div className="space-y-1">
          <Txt as="label" className="text-icon3" variant="ui-sm">
            Frequency Penalty
          </Txt>
          <Input
            type="number"
            value={modelSettings?.frequencyPenalty}
            onChange={e =>
              setModelSettings({
                ...modelSettings,
                frequencyPenalty: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        <div className="space-y-1">
          <Txt as="label" className="text-icon3" variant="ui-sm">
            Presence Penalty
          </Txt>
          <Input
            type="number"
            value={modelSettings?.presencePenalty}
            onChange={e =>
              setModelSettings({
                ...modelSettings,
                presencePenalty: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        <div className="space-y-1">
          <Txt as="label" className="text-icon3" variant="ui-sm">
            Max Tokens
          </Txt>
          <Input
            type="number"
            value={modelSettings?.maxTokens}
            onChange={e =>
              setModelSettings({
                ...modelSettings,
                maxTokens: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        <div className="space-y-1">
          <Txt as="label" className="text-icon3" variant="ui-sm">
            Max Steps
          </Txt>
          <Input
            type="number"
            value={modelSettings?.maxSteps}
            onChange={e =>
              setModelSettings({
                ...modelSettings,
                maxSteps: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        <div className="space-y-1">
          <Txt as="label" className="text-icon3" variant="ui-sm">
            Max Retries
          </Txt>
          <Input
            type="number"
            value={modelSettings?.maxRetries}
            onChange={e =>
              setModelSettings({
                ...modelSettings,
                maxRetries: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>

      <Button onClick={toggleContent}>Back to overview</Button>
      <Button onClick={toggleContent}>Reset</Button>
    </PanelContent>
  );
}
