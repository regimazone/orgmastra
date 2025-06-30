import type { CoreMessage } from 'ai';
import type { LongMemEvalQuestion, Turn } from '../data/types';

export interface MemoryAdapter {
  /**
   * Initialize the memory system for a new evaluation run
   */
  initialize(): Promise<void>;

  /**
   * Load a question's chat history into memory
   */
  loadChatHistory(
    question: LongMemEvalQuestion,
    resourceId: string
  ): Promise<string>; // Returns threadId

  /**
   * Query the memory to answer a question
   */
  queryMemory(
    question: string,
    threadId: string,
    resourceId: string
  ): Promise<string>;

  /**
   * Clear memory for a specific thread
   */
  clearThread(threadId: string): Promise<void>;

  /**
   * Get raw messages for debugging
   */
  getMessages(threadId: string): Promise<CoreMessage[]>;

  /**
   * Get memory statistics
   */
  getStats(): Promise<MemoryStats>;
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