import { GetAgentResponse, UpdateModelInModelListParams } from '@mastra/client-js';
import { useState } from 'react';
import { providerMapToIcon } from '../provider-map-icon';
import { AgentMetadataModelSwitcher } from './agent-metadata-model-switcher';
import { Badge } from '@/ds/components/Badge';
import { Icon } from '@/ds/icons';
import { EditIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

type AgentMetadataModelListType = NonNullable<GetAgentResponse['modelList']>;

export interface AgentMetadataModelListProps {
  modelList: AgentMetadataModelListType;
  modelProviders: string[];
  updateModelInModelList: AgentMetadataModelListItemProps['updateModelInModelList'];
}

export const AgentMetadataModelList = ({
  modelList,
  modelProviders,
  updateModelInModelList,
}: AgentMetadataModelListProps) => {
  return (
    <div className="flex flex-col gap-2">
      {modelList.map(modelConfig => (
        <AgentMetadataModelListItem
          key={modelConfig.id}
          modelConfig={modelConfig}
          modelProviders={modelProviders}
          updateModelInModelList={updateModelInModelList}
        />
      ))}
    </div>
  );
};

interface AgentMetadataModelListItemProps {
  modelConfig: AgentMetadataModelListType[number];
  modelProviders: string[];
  updateModelInModelList: (params: UpdateModelInModelListParams) => Promise<{ message: string }>;
}

const AgentMetadataModelListItem = ({
  modelConfig,
  modelProviders,
  updateModelInModelList,
}: AgentMetadataModelListItemProps) => {
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [enabled, setEnabled] = useState(() => modelConfig.enabled);

  const providerIcon =
    providerMapToIcon[(modelConfig.model.provider || 'openai.chat') as keyof typeof providerMapToIcon];

  return isEditingModel ? (
    <AgentMetadataModelSwitcher
      defaultProvider={modelConfig.model.provider}
      defaultModel={modelConfig.model.modelId}
      updateModel={params => updateModelInModelList({ modelConfigId: modelConfig.id, model: params })}
      closeEditor={() => setIsEditingModel(false)}
      modelProviders={modelProviders}
    />
  ) : (
    <div className="flex items-center gap-2">
      <Badge icon={providerIcon} className="font-medium">
        {modelConfig.model.modelId || 'N/A'}
      </Badge>
      <Switch
        checked={enabled}
        onCheckedChange={checked => {
          setEnabled(checked);
          updateModelInModelList({ modelConfigId: modelConfig.id, enabled: checked });
        }}
      />
      <button onClick={() => setIsEditingModel(true)} className="text-icon3 hover:text-icon6">
        <Icon>
          <EditIcon />
        </Icon>
      </button>
    </div>
  );
};
