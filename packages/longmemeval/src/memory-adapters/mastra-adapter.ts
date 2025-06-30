import type { CoreMessage, EmbeddingModel } from 'ai';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { MemoryConfig } from '@mastra/core';
import type { MastraStorage } from '@mastra/core';
import type { MastraVector } from '@mastra/core';
import type { 
  MemoryAdapter, 
  MemoryStats, 
  ConversionResult 
} from './types';
import type { 
  LongMemEvalQuestion, 
  Turn, 
  MemoryConfigOptions 
} from '../data/types';

export class MastraMemoryAdapter implements MemoryAdapter {
  private mastra: Mastra;
  private agent: Agent;
  private storage?: MastraStorage;
  private vector?: MastraVector;
  private embedder?: EmbeddingModel<string>;
  private memoryConfig: MemoryConfigOptions;
  private threadMap: Map<string, string> = new Map();
  private conversationHistory: Map<string, CoreMessage[]> = new Map();

  constructor(
    mastra: Mastra,
    agent: Agent,
    memoryConfig: MemoryConfigOptions,
    storage?: MastraStorage,
    vector?: MastraVector,
    embedder?: EmbeddingModel<string>
  ) {
    this.mastra = mastra;
    this.agent = agent;
    this.memoryConfig = memoryConfig;
    this.storage = storage;
    this.vector = vector;
    this.embedder = embedder;
  }

  async initialize(): Promise<void> {
    // Initialize storage if provided
    if (this.storage) {
      await this.storage.init();
    }

    // Initialize vector store if using semantic recall
    if (this.memoryConfig.type === 'semantic-recall' && this.vector) {
      // Vector store initialization if needed
    }
  }

  async loadChatHistory(
    question: LongMemEvalQuestion,
    resourceId: string
  ): Promise<string> {
    const threadId = `thread_${question.question_id}_${Date.now()}`;
    this.threadMap.set(question.question_id, threadId);

    const { messages, metadata } = this.convertToMastraMessages(question);

    // Store the conversation history for later use when querying
    this.conversationHistory.set(threadId, messages);

    return threadId;
  }

  async queryMemory(
    question: string,
    threadId: string,
    resourceId: string
  ): Promise<string> {
    try {
      // Get the pre-loaded conversation history
      const fullHistory = this.conversationHistory.get(threadId) || [];
      let context: CoreMessage[] = [];

      switch (this.memoryConfig.type) {
        case 'full-history':
          // Use all messages
          context = fullHistory;
          break;

        case 'last-k':
          // Get last K messages
          const k = this.memoryConfig.lastK || 20;
          context = fullHistory.slice(-k);
          break;

        case 'semantic-recall':
          // For now, we'll use a simple approach - this would need vector search in production
          context = fullHistory.slice(-10);
          break;

        case 'working-memory':
          // Add working memory template as system message
          if (this.memoryConfig.workingMemoryTemplate) {
            context = [
              {
                role: 'system',
                content: `Working Memory:\n${this.memoryConfig.workingMemoryTemplate}`,
              },
              ...fullHistory.slice(-10),
            ];
          } else {
            context = fullHistory.slice(-10);
          }
          break;

        case 'combined':
          // Combine strategies
          const lastK = this.memoryConfig.lastK || 10;
          context = fullHistory.slice(-lastK);
          break;

        default:
          context = fullHistory;
      }

      // Query the agent with the context
      const response = await this.agent.stream([
        ...context,
        {
          role: 'user',
          content: question,
        },
      ], {
        threadId,
        resourceId,
      });

      // Collect the full response
      let fullResponse = '';
      for await (const chunk of response.textStream) {
        fullResponse += chunk;
      }

      return fullResponse;
    } catch (error) {
      console.error('Error querying memory:', error);
      throw error;
    }
  }

  async clearThread(threadId: string): Promise<void> {
    // Clear from our local cache
    this.conversationHistory.delete(threadId);
    this.threadMap.delete(threadId);
  }

  async getMessages(threadId: string): Promise<CoreMessage[]> {
    return this.conversationHistory.get(threadId) || [];
  }

  async getStats(): Promise<MemoryStats> {
    // Get statistics from storage
    return {
      totalThreads: this.threadMap.size,
      totalMessages: 0, // Would need to query storage
      totalTokens: undefined,
      vectorStoreSize: undefined,
    };
  }

  private convertToMastraMessages(question: LongMemEvalQuestion): ConversionResult {
    const messages: CoreMessage[] = [];
    const metadata = {
      sessionCount: question.haystack_sessions.length,
      turnCount: 0,
      evidenceTurns: 0,
      evidenceSessions: question.answer_session_ids,
    };

    // Process each session with its timestamp
    for (let sessionIdx = 0; sessionIdx < question.haystack_sessions.length; sessionIdx++) {
      const session = question.haystack_sessions[sessionIdx];
      const sessionId = question.haystack_session_ids[sessionIdx];
      const sessionDate = question.haystack_dates[sessionIdx];

      // Add session timestamp as system message for temporal context
      messages.push({
        role: 'system',
        content: `[Session ${sessionId} - ${sessionDate}]`,
      });

      // Process each turn in the session
      for (const turn of session) {
        metadata.turnCount++;
        
        if (turn.has_answer) {
          metadata.evidenceTurns++;
        }

        messages.push({
          role: turn.role,
          content: turn.content,
        });
      }
    }

    return { messages, metadata };
  }

  private async getSemanticMessages(
    query: string,
    threadId: string,
    topK: number
  ): Promise<CoreMessage[]> {
    // This would implement semantic search using the vector store
    // For now, returning empty array as placeholder
    return [];
  }
}