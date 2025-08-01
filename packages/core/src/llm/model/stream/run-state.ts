import type { LanguageModelV1 } from 'ai';
import type { StreamInternal } from './types';

type State = {
  stepResult: Record<string, any> | undefined;
  responseMetadata: Record<string, any> | undefined;
  hasToolCallStreaming: boolean;
  hasErrored: boolean;
  reasoningDeltas: string[];
  isReasoning: boolean;
  providerOptions: Record<string, any> | undefined;
};

export class AgenticRunState {
  #state: State;
  constructor({ _internal, model }: { _internal: StreamInternal; model: LanguageModelV1 }) {
    this.#state = {
      responseMetadata: {
        id: _internal?.generateId?.(),
        timestamp: _internal?.currentDate?.(),
        modelId: model.modelId,
        headers: undefined,
      },
      isReasoning: false,
      providerOptions: undefined,
      hasToolCallStreaming: false,
      hasErrored: false,
      reasoningDeltas: [],
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
