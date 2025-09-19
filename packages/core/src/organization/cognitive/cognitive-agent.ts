import { randomUUID } from 'crypto';
import { Agent } from '../../agent';
import { MastraBase } from '../../base';
import type { Mastra } from '../../mastra';
import { InstrumentClass } from '../../telemetry';
import { Person } from '../person';
import type { PersonConfig, OrganizationalPosition } from '../types';
import { AtomSpace  } from './atomspace';
import type {AtomSpaceConfig} from './atomspace';
import { AttentionBank  } from './attention';
import type {AttentionBankConfig} from './attention';
import { PLNReasoner  } from './reasoning/pln';
import type {PLNReasonerConfig} from './reasoning/pln';
import type { 
  Atom, 
  AtomType, 
  TruthValue, 
  AttentionValue, 
  CognitiveContext, 
  CognitiveResult 
} from './types';

/**
 * Configuration for cognitive agent
 */
export interface CognitiveAgentConfig extends Omit<PersonConfig, 'agentConfig'> {
  /** Base agent configuration */
  agentConfig: PersonConfig['agentConfig'];
  /** Cognitive capabilities */
  cognitiveCapabilities: string[];
  /** AtomSpace configuration */
  atomSpaceConfig?: Partial<AtomSpaceConfig>;
  /** Attention bank configuration */
  attentionConfig?: Partial<AttentionBankConfig>;
  /** PLN reasoner configuration */
  reasonerConfig?: Partial<PLNReasonerConfig>;
  /** Enable autonomous cognitive processing */
  autonomousProcessing?: boolean;
  /** Cognitive processing interval in milliseconds */
  processingInterval?: number;
}

/**
 * Cognitive statistics for monitoring
 */
export interface CognitiveStatistics {
  atomCount: number;
  attentionFocus: number;
  inferenceCount: number;
  averageConfidence: number;
  processingCycles: number;
  cognitiveLoad: number;
}

/**
 * Cognitive agent that combines traditional agent capabilities with 
 * OpenCog-inspired cognitive architecture
 */
@InstrumentClass({
  prefix: 'cognitive-agent',
  excludeMethods: ['__registerMastra', '__registerPrimitives', '__setLogger', '__setTelemetry'],
})
export class CognitiveAgent extends Person {
  #atomSpace: AtomSpace;
  #attentionBank: AttentionBank;
  #reasoner: PLNReasoner;
  #cognitiveCapabilities: Set<string>;
  #processingTimer?: NodeJS.Timeout;
  #statistics: CognitiveStatistics;
  #autonomousProcessing: boolean;

  constructor(config: CognitiveAgentConfig) {
    super(config);
    
    this.#cognitiveCapabilities = new Set(config.cognitiveCapabilities);
    this.#autonomousProcessing = config.autonomousProcessing ?? true;
    
    // Initialize cognitive components
    this.#atomSpace = new AtomSpace({
      name: `${config.id}_atomspace`,
      maxAtoms: 50000,
      enableAttention: true,
      ...config.atomSpaceConfig,
    });

    this.#attentionBank = new AttentionBank({
      name: `${config.id}_attention`,
      totalSTI: 10000,
      totalLTI: 10000,
      focusThreshold: 100,
      forgettingThreshold: -50,
      maxAttentionAtoms: 50,
      decayRate: 0.01,
      spreadingRate: 0.1,
      ...config.attentionConfig,
    });

    this.#reasoner = new PLNReasoner({
      name: `${config.id}_reasoner`,
      maxInferenceDepth: 3,
      minConfidenceThreshold: 0.3,
      maxInferencesPerStep: 10,
      enableProbabilisticLogic: true,
      ...config.reasonerConfig,
    });

    this.#statistics = {
      atomCount: 0,
      attentionFocus: 0,
      inferenceCount: 0,
      averageConfidence: 0,
      processingCycles: 0,
      cognitiveLoad: 0,
    };

    // Start autonomous processing if enabled
    if (this.#autonomousProcessing) {
      this.startCognitiveProcessing(config.processingInterval || 30000);
    }
  }

  /**
   * Add knowledge to the agent's AtomSpace
   */
  public async addKnowledge(
    type: AtomType,
    name?: string,
    relatedConcepts?: string[],
    confidence: number = 0.7,
    metadata?: Record<string, any>
  ): Promise<Atom> {
    const atom = await this.#atomSpace.addAtom(
      type,
      name,
      relatedConcepts,
      { strength: 0.8, confidence, count: 1 },
      metadata
    );

    // Allocate initial attention
    this.#attentionBank.allocateAttention(atom.id, 10, 5);

    this.#updateStatistics();
    this.logger?.info('Knowledge added to cognitive agent', {
      agentId: this.id,
      atomId: atom.id,
      type,
      name,
    });

    return atom;
  }

  /**
   * Query the agent's knowledge
   */
  public async queryKnowledge(query: {
    type?: AtomType;
    name?: string;
    concepts?: string[];
    minConfidence?: number;
  }): Promise<Atom[]> {
    const results = await this.#atomSpace.queryAtoms({
      type: query.type,
      name: query.name,
      truthValueMin: query.minConfidence ? { confidence: query.minConfidence } : undefined,
    });

    // Stimulate queried atoms with attention
    for (const atom of results) {
      this.#attentionBank.stimulate(atom.id, 5);
    }

    return results;
  }

  /**
   * Perform cognitive inference
   */
  public async performInference(
    targetConcepts?: string[],
    rules?: string[]
  ): Promise<CognitiveResult> {
    try {
      // Get atoms in attention focus
      const focusedAtomIds = this.#attentionBank.getFocusedAtoms();
      const focusedAtoms = focusedAtomIds
        .map(id => this.#atomSpace.getAtom(id))
        .filter(Boolean) as Atom[];

      if (focusedAtoms.length === 0) {
        return {
          success: false,
          error: {
            code: 'NO_FOCUSED_ATOMS',
            message: 'No atoms in attention focus for inference',
          },
        };
      }

      // Perform PLN inference
      const inferenceResults = await this.#reasoner.performInference(
        focusedAtoms,
        targetConcepts,
        rules as any[]
      );

      // Add derived atoms to AtomSpace
      const newAtoms: Atom[] = [];
      for (const result of inferenceResults) {
        for (const derivedAtom of result.derivedAtoms) {
          const addedAtom = await this.#atomSpace.addAtom(
            derivedAtom.type,
            derivedAtom.name,
            derivedAtom.outgoing,
            derivedAtom.truthValue,
            { ...derivedAtom.metadata, inferred: true }
          );
          newAtoms.push(addedAtom);

          // Allocate attention to new inferences
          this.#attentionBank.allocateAttention(
            addedAtom.id,
            Math.floor(derivedAtom.truthValue.confidence * 50),
            Math.floor(derivedAtom.truthValue.strength * 20)
          );
        }
      }

      this.#statistics.inferenceCount += inferenceResults.length;
      this.#updateStatistics();

      return {
        success: true,
        data: {
          inferredAtoms: newAtoms,
          conclusions: inferenceResults.map(r => r.explanation),
          confidence: inferenceResults.length > 0 
            ? inferenceResults.reduce((sum, r) => sum + r.confidence, 0) / inferenceResults.length
            : 0,
        },
        metadata: {
          executionTime: Date.now(),
          resourcesUsed: ['atomspace', 'attention', 'reasoner'],
          inferenceRules: inferenceResults.map(r => r.rule),
        } as any,
      };
    } catch (error) {
      this.logger?.error('Cognitive inference failed', { agentId: this.id, error });
      return {
        success: false,
        error: {
          code: 'INFERENCE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown inference error',
        },
      };
    }
  }

  /**
   * Focus attention on specific concepts
   */
  public focusAttention(conceptNames: string[], intensity: number = 50): void {
    for (const name of conceptNames) {
      const atoms = this.#atomSpace.getAtomsByName(name);
      for (const atom of atoms) {
        this.#attentionBank.allocateAttention(atom.id, intensity, intensity * 0.5);
      }
    }
    
    this.logger?.debug('Attention focused', { 
      agentId: this.id, 
      concepts: conceptNames, 
      intensity 
    });
  }

  /**
   * Learn from experience by updating truth values
   */
  public async learn(
    experience: {
      concepts: string[];
      outcome: 'positive' | 'negative' | 'neutral';
      strength: number;
    }
  ): Promise<void> {
    const strengthDelta = experience.outcome === 'positive' ? experience.strength :
                         experience.outcome === 'negative' ? -experience.strength : 0;

    for (const conceptName of experience.concepts) {
      const atoms = this.#atomSpace.getAtomsByName(conceptName);
      for (const atom of atoms) {
        // Update truth value based on experience
        const newStrength = Math.max(0, Math.min(1, 
          atom.truthValue.strength + strengthDelta * 0.1
        ));
        const newConfidence = Math.min(1, 
          atom.truthValue.confidence + 0.05
        );

        atom.truthValue = {
          strength: newStrength,
          confidence: newConfidence,
          count: atom.truthValue.count + 1,
        };

        // Allocate attention based on learning outcome
        this.#attentionBank.allocateAttention(
          atom.id, 
          Math.abs(strengthDelta) * 20,
          strengthDelta > 0 ? 10 : -5
        );
      }
    }

    this.logger?.info('Learning completed', {
      agentId: this.id,
      concepts: experience.concepts,
      outcome: experience.outcome,
    });
  }

  /**
   * Get cognitive statistics
   */
  public getCognitiveStatistics(): CognitiveStatistics {
    return { ...this.#statistics };
  }

  /**
   * Get current attention focus
   */
  public getAttentionFocus(): Array<{ atom: Atom; attention: AttentionValue }> {
    const focusedIds = this.#attentionBank.getFocusedAtoms();
    return focusedIds.map(id => ({
      atom: this.#atomSpace.getAtom(id)!,
      attention: this.#attentionBank.getAttentionValue(id)!,
    })).filter(item => item.atom);
  }

  /**
   * Start autonomous cognitive processing
   */
  public startCognitiveProcessing(intervalMs: number = 30000): void {
    if (this.#processingTimer) {
      clearInterval(this.#processingTimer);
    }

    this.#processingTimer = setInterval(async () => {
      await this.#runCognitiveLoop();
    }, intervalMs);

    this.logger?.info('Autonomous cognitive processing started', {
      agentId: this.id,
      intervalMs,
    });
  }

  /**
   * Stop autonomous cognitive processing
   */
  public stopCognitiveProcessing(): void {
    if (this.#processingTimer) {
      clearInterval(this.#processingTimer);
      this.#processingTimer = undefined;
    }

    this.logger?.info('Autonomous cognitive processing stopped', {
      agentId: this.id,
    });
  }

  /**
   * Check if agent has specific cognitive capability
   */
  public hasCognitiveCapability(capability: string): boolean {
    return this.#cognitiveCapabilities.has(capability);
  }

  /**
   * Run one cognitive processing loop
   */
  async #runCognitiveLoop(): Promise<void> {
    try {
      // 1. Update attention dynamics
      const topAttention = this.#attentionBank.getTopAttentionAtoms(10);
      
      // 2. Perform inference on focused atoms
      if (topAttention.length > 0) {
        await this.performInference();
      }

      // 3. Spread attention along atom relationships
      for (const { atomId } of topAttention.slice(0, 3)) {
        const atom = this.#atomSpace.getAtom(atomId);
        if (atom?.outgoing) {
          this.#attentionBank.spreadAttention(atomId, atom.outgoing, 0.1);
        }
      }

      // 4. Update cognitive load
      this.#updateCognitiveLoad();

      this.#statistics.processingCycles++;
      
      this.logger?.debug('Cognitive loop completed', {
        agentId: this.id,
        cycle: this.#statistics.processingCycles,
        attentionFocus: topAttention.length,
      });
    } catch (error) {
      this.logger?.error('Cognitive loop failed', { agentId: this.id, error });
    }
  }

  /**
   * Update cognitive statistics
   */
  #updateStatistics(): void {
    const attentionStats = this.#attentionBank.getStatistics();
    
    this.#statistics.atomCount = attentionStats.totalAtoms;
    this.#statistics.attentionFocus = attentionStats.focusedAtoms;
    this.#statistics.averageConfidence = attentionStats.averageSTI / 100; // Normalize
  }

  /**
   * Update cognitive load based on processing demands
   */
  #updateCognitiveLoad(): void {
    const attentionStats = this.#attentionBank.getStatistics();
    const loadFactors = [
      attentionStats.focusedAtoms / 50, // Attention load
      this.#statistics.atomCount / 10000, // Memory load
      this.#statistics.inferenceCount / 100, // Processing load
    ];
    
    this.#statistics.cognitiveLoad = Math.min(1, 
      loadFactors.reduce((sum, factor) => sum + factor, 0) / loadFactors.length
    );
  }
}

