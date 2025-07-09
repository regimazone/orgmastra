export type ScorerSettings = {
  sampling: {
    type: 'ratio';
    rate: number;
  };
};

export type ScorersSettingsRecord = Record<string, ScorerSettings>;
