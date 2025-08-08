import type { LanguageModelV1 } from 'ai';
import type { LanguageModel as LanguageModelAI5 } from 'ai-v5';
import type { StreamInternal } from './types';

type LanguageModelV2 = Exclude<LanguageModelAI5, string>;

type State = {
  stepResult: Record<string, any> | undefined;
  responseMetadata: Record<string, any> | undefined;
  hasToolCallStreaming: boolean;
  hasErrored: boolean;
  reasoningDeltas: string[];
  textDeltas: string[];
  isReasoning: boolean;
  isStreaming: boolean;
  providerOptions: Record<string, any> | undefined;
};

export class AgenticRunState {
  #state: State;
  constructor({ _internal, model }: { _internal: StreamInternal; model: LanguageModelV1 | LanguageModelV2 }) {
    this.#state = {
      responseMetadata: {
        id: _internal?.generateId?.(),
        timestamp: _internal?.currentDate?.(),
        modelId: model.modelId,
        headers: undefined,
      },
      isReasoning: false,
      isStreaming: false,
      providerOptions: undefined,
      hasToolCallStreaming: false,
      hasErrored: false,
      reasoningDeltas: [],
      textDeltas: [],
      stepResult: undefined,
    };
  }

  setState(state: Partial<State>) {
    this.#state = {
      ...this.#state,
      ...state,
    };
  }

  get state() {
    return this.#state;
  }
}
