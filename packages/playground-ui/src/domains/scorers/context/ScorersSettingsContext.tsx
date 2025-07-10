import { createContext, useContext, useEffect, useState } from 'react';
import { ScorerSettings, ScorersSettingsRecord } from '../types';
import { ScoringEntityType } from '@mastra/core';

const ScorerSettingsContext = createContext<{
  entityType: ScoringEntityType;
  entityId: string;
  entitySettings: ScorersSettingsRecord | undefined;
  setEntitySettings: (scorerName: string, partialSettings: ScorerSettings) => void;
  resetEntitySettings: () => void;
}>(
  {} as {
    entityType: ScoringEntityType;
    entityId: string;
    entitySettings: ScorersSettingsRecord;
    setEntitySettings: (scorerName: string, partialSettings: ScorerSettings) => void;
    resetEntitySettings: () => void;
  },
);

export interface ScorerSettingsProviderProps {
  children: React.ReactNode;
  entityType: ScoringEntityType;
  entityId: string;
}

const defaultEntityScorerSettings: ScorerSettings = {
  sampling: {
    type: 'ratio',
    rate: 0,
  },
};

export const ScorerSettingsProvider = ({ children, entityType, entityId }: ScorerSettingsProviderProps) => {
  const [entitySettings, setEntitySettings] = useState<ScorersSettingsRecord | undefined>(undefined);

  useEffect(() => {
    const settings = localStorage.getItem(`${entityType}-${entityId}-scorers-settings`);
    if (!settings) return;

    try {
      setEntitySettings(JSON.parse(settings));
    } catch {
      // JSON.parse failed, silent fail
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (!entitySettings) return;
    localStorage.setItem(`${entityType}-${entityId}-scorers-settings`, JSON.stringify(entitySettings));
  }, [entitySettings]);

  const _setEntitySettings = (scorerName: string, partialSettings: ScorerSettings) => {
    setEntitySettings(prev => ({ ...prev, [scorerName]: { ...prev?.[scorerName], ...partialSettings } }));
  };

  const resetEntitySettings = () => {
    const scorers = Object.keys(defaultEntityScorerSettings);
    const newSettings = scorers.reduce((acc, scorerName) => {
      acc[scorerName] = defaultEntityScorerSettings;
      return acc;
    }, {} as ScorersSettingsRecord);

    setEntitySettings(newSettings);
  };

  return (
    <ScorerSettingsContext.Provider
      value={{ entityType, entityId, setEntitySettings: _setEntitySettings, entitySettings, resetEntitySettings }}
    >
      {children}
    </ScorerSettingsContext.Provider>
  );
};

export const useScorerSettings = () => {
  return useContext(ScorerSettingsContext);
};
