import { MastraBase } from '../../base';
import { RegisteredLogger } from '../../logger/constants';
import { InstrumentClass } from '../../telemetry';
import type { CognitiveContext } from './types';

/**
 * Mind agent types for specialized cognitive processing
 */
export type MindAgentType =
  | 'attention-allocation'
  | 'pattern-recognition'
  | 'goal-pursuit'
  | 'learning'
  | 'memory-consolidation'
  | 'inference'
  | 'planning'
  | 'adaptation';

/**
 * Configuration for mind agent
 */
export interface MindAgentConfig {
  id: string;
  name: string;
  type: MindAgentType;
  priority: number;
  frequency: number; // How often to run in milliseconds
  enabled: boolean;
  parameters: Record<string, any>;
}

/**
 * Mind agent execution result
 */
export interface MindAgentResult {
  agentId: string;
  type: MindAgentType;
  success: boolean;
  executionTime: number;
  actionsPerformed: string[];
  resourcesModified: string[];
  nextRunTime?: number;
  error?: string;
}

/**
 * Abstract base class for mind agents - specialized cognitive processes
 * that run autonomously to maintain and improve cognitive functioning
 */
@InstrumentClass({
  prefix: 'mind-agent',
  excludeMethods: ['__setLogger', '__setTelemetry'],
})
export abstract class MindAgent extends MastraBase {
  protected config: MindAgentConfig;
  protected lastRunTime: number = 0;
  protected runCount: number = 0;
  protected enabled: boolean;

  constructor(config: MindAgentConfig) {
    super({ component: RegisteredLogger.MIND_AGENT, name: config.name });
    this.config = config;
    this.enabled = config.enabled;
  }

  /**
   * Main execution method - must be implemented by subclasses
   */
  abstract execute(context: CognitiveContext): Promise<MindAgentResult>;

  /**
   * Check if agent should run based on frequency and priority
   */
  public shouldRun(currentTime: number): boolean {
    if (!this.enabled) return false;
    return currentTime - this.lastRunTime >= this.config.frequency;
  }

  /**
   * Run the mind agent
   */
  public async run(context: CognitiveContext): Promise<MindAgentResult> {
    const startTime = Date.now();
    this.lastRunTime = startTime;
    this.runCount++;

    try {
      const result = await this.execute(context);
      result.executionTime = Date.now() - startTime;

      this.logger?.debug('Mind agent executed', {
        agentId: this.config.id,
        type: this.config.type,
        runCount: this.runCount,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Mind agent execution failed', {
        agentId: this.config.id,
        error: errorMessage,
      });

      return {
        agentId: this.config.id,
        type: this.config.type,
        success: false,
        executionTime: Date.now() - startTime,
        actionsPerformed: [],
        resourcesModified: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Enable or disable the mind agent
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.logger?.info('Mind agent enabled status changed', {
      agentId: this.config.id,
      enabled,
    });
  }

  /**
   * Update agent configuration
   */
  public updateConfig(updates: Partial<MindAgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger?.info('Mind agent configuration updated', {
      agentId: this.config.id,
      updates,
    });
  }

  /**
   * Get agent configuration
   */
  public getConfig(): MindAgentConfig {
    return { ...this.config };
  }

  /**
   * Get agent statistics
   */
  public getStatistics(): {
    id: string;
    type: MindAgentType;
    runCount: number;
    lastRunTime: number;
    enabled: boolean;
    averageExecutionTime: number;
  } {
    return {
      id: this.config.id,
      type: this.config.type,
      runCount: this.runCount,
      lastRunTime: this.lastRunTime,
      enabled: this.enabled,
      averageExecutionTime: 0, // Would track this in practice
    };
  }
}

/**
 * Attention allocation mind agent
 */
export class AttentionAllocationAgent extends MindAgent {
  constructor(config: Omit<MindAgentConfig, 'type'>) {
    super({ ...config, type: 'attention-allocation' });
  }

  async execute(_context: CognitiveContext): Promise<MindAgentResult> {
    const actions: string[] = [];
    const resources: string[] = ['attention-bank'];

    // Simulate attention allocation logic
    actions.push('redistributed-attention');
    actions.push('updated-focus-threshold');

    if (this.config.parameters.enableDecay) {
      actions.push('applied-attention-decay');
    }

    return {
      agentId: this.config.id,
      type: this.config.type,
      success: true,
      executionTime: 0, // Will be set by parent
      actionsPerformed: actions,
      resourcesModified: resources,
      nextRunTime: Date.now() + this.config.frequency,
    };
  }
}

/**
 * Pattern recognition mind agent
 */
export class PatternRecognitionAgent extends MindAgent {
  constructor(config: Omit<MindAgentConfig, 'type'>) {
    super({ ...config, type: 'pattern-recognition' });
  }

  async execute(_context: CognitiveContext): Promise<MindAgentResult> {
    const actions: string[] = [];
    const resources: string[] = ['atomspace', 'pattern-index'];

    // Simulate pattern recognition logic
    actions.push('identified-patterns');
    actions.push('updated-pattern-index');

    if (this.config.parameters.createAbstractions) {
      actions.push('created-abstract-patterns');
    }

    return {
      agentId: this.config.id,
      type: this.config.type,
      success: true,
      executionTime: 0,
      actionsPerformed: actions,
      resourcesModified: resources,
      nextRunTime: Date.now() + this.config.frequency,
    };
  }
}

/**
 * Goal pursuit mind agent
 */
export class GoalPursuitAgent extends MindAgent {
  constructor(config: Omit<MindAgentConfig, 'type'>) {
    super({ ...config, type: 'goal-pursuit' });
  }

  async execute(_context: CognitiveContext): Promise<MindAgentResult> {
    const actions: string[] = [];
    const resources: string[] = ['goal-stack', 'action-planner'];

    // Simulate goal pursuit logic
    actions.push('evaluated-goals');
    actions.push('planned-actions');

    if (this.config.parameters.adaptivePlanning) {
      actions.push('adapted-plans');
    }

    return {
      agentId: this.config.id,
      type: this.config.type,
      success: true,
      executionTime: 0,
      actionsPerformed: actions,
      resourcesModified: resources,
      nextRunTime: Date.now() + this.config.frequency,
    };
  }
}

/**
 * Learning mind agent
 */
export class LearningAgent extends MindAgent {
  constructor(config: Omit<MindAgentConfig, 'type'>) {
    super({ ...config, type: 'learning' });
  }

  async execute(_context: CognitiveContext): Promise<MindAgentResult> {
    const actions: string[] = [];
    const resources: string[] = ['atomspace', 'truth-values'];

    // Simulate learning logic
    actions.push('updated-truth-values');
    actions.push('reinforced-patterns');

    if (this.config.parameters.enableForgetting) {
      actions.push('forgot-low-confidence-atoms');
    }

    return {
      agentId: this.config.id,
      type: this.config.type,
      success: true,
      executionTime: 0,
      actionsPerformed: actions,
      resourcesModified: resources,
      nextRunTime: Date.now() + this.config.frequency,
    };
  }
}

/**
 * Memory consolidation mind agent
 */
export class MemoryConsolidationAgent extends MindAgent {
  constructor(config: Omit<MindAgentConfig, 'type'>) {
    super({ ...config, type: 'memory-consolidation' });
  }

  async execute(_context: CognitiveContext): Promise<MindAgentResult> {
    const actions: string[] = [];
    const resources: string[] = ['atomspace', 'long-term-memory'];

    // Simulate memory consolidation logic
    actions.push('consolidated-memories');
    actions.push('promoted-important-atoms');

    if (this.config.parameters.enableCompression) {
      actions.push('compressed-redundant-memories');
    }

    return {
      agentId: this.config.id,
      type: this.config.type,
      success: true,
      executionTime: 0,
      actionsPerformed: actions,
      resourcesModified: resources,
      nextRunTime: Date.now() + this.config.frequency,
    };
  }
}
