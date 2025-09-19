import { randomUUID } from 'crypto';
import { MastraBase } from '../../base';
import type { PubSub } from '../../events/pubsub';
import { RegisteredLogger } from '../../logger/constants';
import { InstrumentClass } from '../../telemetry';
import type { CognitiveAgent } from './cognitive-agent';
import type { MindAgent, MindAgentResult } from './mind-agent';
import type { CognitiveContext, CognitiveResult } from './types';

/**
 * Configuration for cognitive coordinator
 */
export interface CognitiveCoordinatorConfig {
  name: string;
  maxConcurrentProcesses: number;
  coordinationTimeout: number;
  enableDistributedInference: boolean;
  knowledgeShareThreshold: number;
  consensusThreshold: number;
}

/**
 * Distributed cognitive coordination request
 */
export interface DistributedCognitiveRequest {
  id: string;
  type: 'distributed-inference' | 'knowledge-sharing' | 'consensus-building' | 'collective-learning';
  initiator: string;
  participants: string[];
  payload: {
    query?: string;
    concepts?: string[];
    knowledgeToShare?: any[];
    consensusTarget?: any;
    [key: string]: any;
  };
  timeout: number;
  createdAt: Date;
}

/**
 * Result of distributed cognitive operation
 */
export interface DistributedCognitiveResult {
  requestId: string;
  success: boolean;
  participants: string[];
  aggregatedResult?: any;
  consensus?: {
    agreement: number;
    finalDecision: any;
    dissenting: string[];
  };
  knowledgeTransfer?: {
    atomsShared: number;
    recipientUpdates: Record<string, number>;
  };
  error?: string;
}

/**
 * Coordinates cognitive processes across multiple cognitive agents
 * implementing distributed cognitive architecture
 */
@InstrumentClass({
  prefix: 'cognitive-coordinator',
  excludeMethods: ['__setLogger', '__setTelemetry'],
})
export class CognitiveCoordinator extends MastraBase {
  #config: CognitiveCoordinatorConfig;
  #agents: Map<string, CognitiveAgent>;
  #mindAgents: Map<string, MindAgent>;
  #pubsub: PubSub;
  #activeRequests: Map<string, DistributedCognitiveRequest>;
  #requestResults: Map<string, DistributedCognitiveResult>;

  constructor(pubsub: PubSub, config: CognitiveCoordinatorConfig) {
    super({ component: RegisteredLogger.COGNITIVE_COORDINATOR, name: config.name });

    this.#config = config;
    this.#agents = new Map();
    this.#mindAgents = new Map();
    this.#pubsub = pubsub;
    this.#activeRequests = new Map();
    this.#requestResults = new Map();

    this.#setupEventListeners();
  }

  /**
   * Register a cognitive agent with the coordinator
   */
  public registerAgent(agent: CognitiveAgent): void {
    this.#agents.set(agent.id, agent);
    this.logger?.info('Cognitive agent registered', {
      agentId: agent.id,
      capabilities: agent.getSkills(),
    });
  }

  /**
   * Register a mind agent for autonomous processing
   */
  public registerMindAgent(mindAgent: MindAgent): void {
    this.#mindAgents.set(mindAgent.getConfig().id, mindAgent);
    this.logger?.info('Mind agent registered', {
      agentId: mindAgent.getConfig().id,
      type: mindAgent.getConfig().type,
    });
  }

  /**
   * Initiate distributed inference across multiple agents
   */
  public async performDistributedInference(
    query: string,
    participantIds: string[],
    timeout: number = 30000,
  ): Promise<DistributedCognitiveResult> {
    const requestId = randomUUID();
    const request: DistributedCognitiveRequest = {
      id: requestId,
      type: 'distributed-inference',
      initiator: 'coordinator',
      participants: participantIds,
      payload: { query },
      timeout,
      createdAt: new Date(),
    };

    this.#activeRequests.set(requestId, request);

    try {
      const results: Record<string, CognitiveResult> = {};
      const promises = participantIds.map(async agentId => {
        const agent = this.#agents.get(agentId);
        if (!agent) return null;

        try {
          const result = await agent.performInference([query]);
          results[agentId] = result;
          return result;
        } catch (error) {
          this.logger?.error('Agent inference failed', { agentId, error });
          return null;
        }
      });

      const inferenceResults = await Promise.allSettled(promises);
      const successfulResults = inferenceResults
        .filter(
          (result): result is PromiseFulfilledResult<CognitiveResult> =>
            result.status === 'fulfilled' && result.value?.success === true,
        )
        .map(result => result.value);

      // Aggregate results
      const aggregatedResult = this.#aggregateInferenceResults(successfulResults);

      const distributedResult: DistributedCognitiveResult = {
        requestId,
        success: successfulResults.length > 0,
        participants: Object.keys(results),
        aggregatedResult,
      };

      this.#requestResults.set(requestId, distributedResult);
      this.#activeRequests.delete(requestId);

      this.logger?.info('Distributed inference completed', {
        requestId,
        query,
        participantCount: participantIds.length,
        successfulCount: successfulResults.length,
      });

      return distributedResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const distributedResult: DistributedCognitiveResult = {
        requestId,
        success: false,
        participants: participantIds,
        error: errorMessage,
      };

      this.#requestResults.set(requestId, distributedResult);
      this.#activeRequests.delete(requestId);

      return distributedResult;
    }
  }

  /**
   * Share knowledge between agents
   */
  public async shareKnowledge(
    sourceAgentId: string,
    targetAgentIds: string[],
    knowledgeFilter?: {
      minConfidence?: number;
      maxAge?: number;
      concepts?: string[];
    },
  ): Promise<DistributedCognitiveResult> {
    const requestId = randomUUID();
    const sourceAgent = this.#agents.get(sourceAgentId);

    if (!sourceAgent) {
      return {
        requestId,
        success: false,
        participants: [sourceAgentId],
        error: 'Source agent not found',
      };
    }

    try {
      // Get knowledge from source agent
      const knowledgeQuery = {
        minConfidence: knowledgeFilter?.minConfidence || this.#config.knowledgeShareThreshold,
        concepts: knowledgeFilter?.concepts,
      };

      const sourceKnowledge = await sourceAgent.queryKnowledge(knowledgeQuery);

      if (sourceKnowledge.length === 0) {
        return {
          requestId,
          success: false,
          participants: [sourceAgentId],
          error: 'No knowledge meets sharing criteria',
        };
      }

      // Share with target agents
      const transferStats: Record<string, number> = {};
      let totalShared = 0;

      for (const targetId of targetAgentIds) {
        const targetAgent = this.#agents.get(targetId);
        if (!targetAgent) continue;

        let sharedCount = 0;
        for (const atom of sourceKnowledge) {
          try {
            await targetAgent.addKnowledge(
              atom.type,
              atom.name,
              atom.outgoing,
              atom.truthValue.confidence * 0.8, // Reduce confidence for shared knowledge
              { ...atom.metadata, sharedFrom: sourceAgentId },
            );
            sharedCount++;
          } catch {
            this.logger?.debug('Failed to share atom', {
              sourceAgent: sourceAgentId,
              targetAgent: targetId,
              atomId: atom.id,
            });
          }
        }

        transferStats[targetId] = sharedCount;
        totalShared += sharedCount;
      }

      const result: DistributedCognitiveResult = {
        requestId,
        success: totalShared > 0,
        participants: [sourceAgentId, ...targetAgentIds],
        knowledgeTransfer: {
          atomsShared: totalShared,
          recipientUpdates: transferStats,
        },
      };

      this.logger?.info('Knowledge sharing completed', {
        requestId,
        sourceAgent: sourceAgentId,
        targetCount: targetAgentIds.length,
        atomsShared: totalShared,
      });

      return result;
    } catch (error) {
      return {
        requestId,
        success: false,
        participants: [sourceAgentId, ...targetAgentIds],
        error: error instanceof Error ? error.message : 'Knowledge sharing failed',
      };
    }
  }

  /**
   * Build consensus among agents on a decision
   */
  public async buildConsensus(
    question: string,
    participantIds: string[],
    options: string[],
    _timeout: number = 60000,
  ): Promise<DistributedCognitiveResult> {
    const requestId = randomUUID();

    try {
      // Get responses from each agent
      const responses: Record<string, { choice: string; confidence: number }> = {};

      for (const agentId of participantIds) {
        const agent = this.#agents.get(agentId);
        if (!agent) continue;

        try {
          // Simulate agent decision making based on their knowledge
          const knowledgeRelevant = await agent.queryKnowledge({
            concepts: options,
            minConfidence: 0.3,
          });

          // Simple voting based on knowledge confidence
          let bestOption = options[0] || '';
          let maxConfidence = 0;

          for (const option of options) {
            const relevantAtoms = knowledgeRelevant.filter(
              atom => atom.name?.includes(option) || atom.metadata.concepts?.includes(option),
            );
            const avgConfidence =
              relevantAtoms.length > 0
                ? relevantAtoms.reduce((sum, atom) => sum + atom.truthValue.confidence, 0) / relevantAtoms.length
                : 0.1;

            if (avgConfidence > maxConfidence) {
              maxConfidence = avgConfidence;
              bestOption = option;
            }
          }

          responses[agentId] = { choice: bestOption, confidence: maxConfidence };
        } catch (error) {
          this.logger?.error('Agent consensus participation failed', { agentId, error });
        }
      }

      // Calculate consensus
      const voteCounts: Record<string, { count: number; totalConfidence: number; voters: string[] }> = {};

      for (const option of options) {
        voteCounts[option] = { count: 0, totalConfidence: 0, voters: [] };
      }

      for (const [agentId, response] of Object.entries(responses)) {
        const option = response.choice;
        if (voteCounts[option]) {
          voteCounts[option].count++;
          voteCounts[option].totalConfidence += response.confidence;
          voteCounts[option].voters.push(agentId);
        }
      }

      // Find winner
      let winningOption = options[0] || '';
      let maxScore = 0;

      for (const [option, stats] of Object.entries(voteCounts)) {
        const score = stats.count * (stats.totalConfidence / Math.max(1, stats.count));
        if (score > maxScore) {
          maxScore = score;
          winningOption = option;
        }
      }

      const totalVotes = Object.values(responses).length;
      const winnerVotes = voteCounts[winningOption]?.count || 0;
      const agreement = totalVotes > 0 ? winnerVotes / totalVotes : 0;

      const dissenting = participantIds.filter(id => responses[id] && responses[id].choice !== winningOption);

      const result: DistributedCognitiveResult = {
        requestId,
        success: agreement >= this.#config.consensusThreshold,
        participants: participantIds,
        consensus: {
          agreement,
          finalDecision: winningOption,
          dissenting,
        },
      };

      this.logger?.info('Consensus building completed', {
        requestId,
        question,
        winner: winningOption,
        agreement,
        participantCount: totalVotes,
      });

      return result;
    } catch (error) {
      return {
        requestId,
        success: false,
        participants: participantIds,
        error: error instanceof Error ? error.message : 'Consensus building failed',
      };
    }
  }

  /**
   * Run mind agents cycle
   */
  public async runMindAgentsCycle(): Promise<MindAgentResult[]> {
    const currentTime = Date.now();
    const results: MindAgentResult[] = [];

    const cognitiveContext: CognitiveContext = {
      requestId: randomUUID(),
      requestType: 'cognitive-inference',
      fromEntityId: 'coordinator',
      payload: {
        timestamp: currentTime,
      },
      metadata: {
        cycleType: 'mind-agents',
      },
    };

    for (const mindAgent of this.#mindAgents.values()) {
      if (mindAgent.shouldRun(currentTime)) {
        try {
          const result = await mindAgent.run(cognitiveContext);
          results.push(result);
        } catch (error) {
          this.logger?.error('Mind agent execution failed', {
            agentId: mindAgent.getConfig().id,
            error,
          });
        }
      }
    }

    this.logger?.debug('Mind agents cycle completed', {
      totalAgents: this.#mindAgents.size,
      ranAgents: results.length,
      successfulRuns: results.filter(r => r.success).length,
    });

    return results;
  }

  /**
   * Get coordinator statistics
   */
  public getStatistics(): {
    registeredAgents: number;
    mindAgents: number;
    activeRequests: number;
    completedRequests: number;
    averageResponseTime: number;
  } {
    return {
      registeredAgents: this.#agents.size,
      mindAgents: this.#mindAgents.size,
      activeRequests: this.#activeRequests.size,
      completedRequests: this.#requestResults.size,
      averageResponseTime: 0, // Would calculate from request history
    };
  }

  /**
   * Setup event listeners for coordination
   */
  #setupEventListeners(): void {
    // Listen for cognitive events
    void this.#pubsub.subscribe('cognitive:inference-request', async event => {
      this.logger?.debug('Received cognitive inference request', { event });
      // Handle distributed inference requests
    });

    void this.#pubsub.subscribe('cognitive:knowledge-share', async event => {
      this.logger?.debug('Received knowledge sharing request', { event });
      // Handle knowledge sharing requests
    });
  }

  /**
   * Aggregate inference results from multiple agents
   */
  #aggregateInferenceResults(results: CognitiveResult[]): any {
    if (results.length === 0) return null;

    const allConclusions: string[] = [];
    const allInferredAtoms: any[] = [];
    let totalConfidence = 0;

    for (const result of results) {
      if (result.data?.conclusions) {
        allConclusions.push(...result.data.conclusions);
      }
      if (result.data?.inferredAtoms) {
        allInferredAtoms.push(...result.data.inferredAtoms);
      }
      if (result.data?.confidence) {
        totalConfidence += result.data.confidence;
      }
    }

    return {
      conclusions: allConclusions,
      inferredAtoms: allInferredAtoms,
      averageConfidence: totalConfidence / results.length,
      participantCount: results.length,
    };
  }
}
