import type { LanguageModelV1 } from 'ai';
import type { StreamInternal } from './types';

type State = {
  responseMetadata: Record<string, any> | undefined;
  stepFinishPayload: Record<string, any> | undefined;
  hasToolCallStreaming: boolean;
  hasErrored: boolean;
  reasoningDeltas: string[];
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
      stepFinishPayload: undefined,
      hasToolCallStreaming: false,
      hasErrored: false,
      reasoningDeltas: [],
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
