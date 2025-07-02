import type { CoreMessage } from 'ai';
import { Agent, MessageList } from '@mastra/core/agent';
import { type MastraStorage } from '@mastra/core';
import { MockLanguageModelV1 } from '../test-utils/mock-model';
import type { MastraVector } from '@mastra/core';
import type { MemoryAdapter, ConversionResult } from './types';
import type { LongMemEvalQuestion, MemoryConfigOptions } from '../data/types';

const mockModel = new MockLanguageModelV1({
  doGenerate: async (_props: any) => {
    return {
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop' as const,
      usage: { promptTokens: 10, completionTokens: 20 },
      text: 'hi',
    };
  },
});

export class MastraMemoryAdapter implements MemoryAdapter {
  private agent: Agent;
  private mockAgent: Agent;
  private storage?: MastraStorage;
  private vector?: MastraVector;
  private memoryConfig: MemoryConfigOptions;

  constructor(agent: Agent, memoryConfig: MemoryConfigOptions, storage?: MastraStorage, vector?: MastraVector) {
    this.agent = agent;
    this.mockAgent = new Agent({
      name: 'mock',
      instructions: 'ok',
      model: mockModel,
      memory: agent.getMemory(),
    });
    this.memoryConfig = memoryConfig;
    this.storage = storage;
    this.vector = vector;
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

  async loadChatHistory(question: LongMemEvalQuestion, resourceId: string): Promise<string> {
    const threadId = `thread_${question.question_id}_${Date.now()}`;

    const { messages } = await this.convertToMastraMessages({ question, threadId, resourceId });

    console.log(
      `converted ${messages.length} messages from dataset to mastra messages in thread ${threadId} ${resourceId}`,
    );
    // Save all messages to Mastra's Memory system
    // The agent's memory will handle storage and retrieval based on its configuration
    if (messages.length > 0) {
      const memory = this.agent.getMemory();
      if (!memory) {
        throw new Error('Agent does not have memory configured');
      }

      try {
        // await this.agent.generate([...messages], {
        //   threadId,
        //   resourceId,
        //   memoryOptions: this.memoryConfig.options,
        // });
        // await memory.saveMessages({
        //   messages: messages,
        // });
        console.log(`saved messages`);
      } catch (error) {
        console.error('Error saving messages:', error);
        console.error('Messages that failed:', JSON.stringify(messages, null, 2));
        throw error;
      }
    }

    return threadId;
  }

  async queryMemory(question: string, threadId: string, resourceId: string): Promise<string> {
    try {
      // Let Mastra's Memory handle the context retrieval based on the memory configuration
      // The agent will automatically use its memory to get relevant context
      const response = await this.agent.generate(question, {
        threadId,
        resourceId,
      });

      return response.text;
    } catch (error) {
      console.error('Error querying memory:', error);
      throw error;
    }
  }

  private async convertToMastraMessages({
    question,
    threadId,
    resourceId,
  }: {
    question: LongMemEvalQuestion;
    threadId: string;
    resourceId: string;
  }): Promise<ConversionResult> {
    const list = new MessageList({ resourceId, threadId });
    const metadata = {
      sessionCount: question.haystack_sessions.length,
      turnCount: 0,
      evidenceTurns: 0,
      evidenceSessions: question.answer_session_ids,
    };

    // Prepare all sessions for parallel processing
    const BATCH_SIZE = 20; // Process 10 sessions concurrently

    // Process sessions in batches
    for (let batchStart = 0; batchStart < question.haystack_sessions.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, question.haystack_sessions.length);
      const batchPromises: Promise<void>[] = [];

      for (let sessionIdx = batchStart; sessionIdx < batchEnd; sessionIdx++) {
        const session = question.haystack_sessions[sessionIdx];

        // Create promise for this session
        const sessionPromise = (async () => {
          const nestedList = new MessageList({ threadId, resourceId });

          // Process each turn in the session
          for (let turnIdx = 0; turnIdx < session.length; turnIdx++) {
            const turn = session[turnIdx];
            metadata.turnCount++;

            if (turn.has_answer) {
              console.log(`session id ${sessionIdx} has answer`);
              console.log(turn);
              metadata.evidenceTurns++;
            }

            // Validate role - ensure it's either 'user' or 'assistant'
            const role = turn.role === 'user' || turn.role === 'assistant' ? turn.role : 'user';

            // Skip empty content and ensure content is a string
            if (!turn.content) {
              continue;
            }

            list.add(
              {
                role,
                content: turn.content,
              } as CoreMessage,
              'memory',
            );
            nestedList.add(
              {
                role,
                content: turn.content,
              } as CoreMessage,
              'memory',
            );
          }

          const coreMessages = nestedList.get.all.core();
          if (coreMessages.length > 0) {
            console.log(
              `Processing session ${sessionIdx + 1}/${question.haystack_sessions.length}: ${coreMessages.length} messages`,
            );
            // use a mock agent so we don't have to hit the LLM API
            // but we still run through all the agent memory paths for adding to memory
            await this.mockAgent.generate(coreMessages, {
              threadId,
              resourceId,
              memoryOptions: this.memoryConfig.options,
            });
            console.log(`Completed session ${sessionIdx + 1}/${question.haystack_sessions.length}`);
          }
        })();

        batchPromises.push(sessionPromise);
      }

      // Wait for this batch to complete before starting the next
      console.log(
        `Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(question.haystack_sessions.length / BATCH_SIZE)}...`,
      );
      await Promise.all(batchPromises);
    }

    return { messages: list.get.all.core(), metadata };
  }
}
