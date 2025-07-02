import type { LongMemEvalQuestion } from '../data/types';
import { CoreMessage } from '@mastra/core';

export interface MemoryAdapter {
  /**
   * Initialize the memory system for a new evaluation run
   */
  initialize(): Promise<void>;

  /**
   * Load a question's chat history into memory
   */
  loadChatHistory(question: LongMemEvalQuestion, resourceId: string): Promise<string>; // Returns threadId

  /**
   * Query the memory to answer a question
   */
  queryMemory(question: string, threadId: string, resourceId: string): Promise<string>;
}

export interface MemoryStats {
  totalThreads: number;
  totalMessages: number;
  totalTokens?: number;
  vectorStoreSize?: number;
}

export interface ConversionResult {
  messages: CoreMessage[];
  metadata: {
    sessionCount: number;
    turnCount: number;
    evidenceTurns: number;
    evidenceSessions: string[];
  };
}
