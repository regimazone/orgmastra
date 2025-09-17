import { randomUUID } from 'crypto';
import { MastraBase } from '../../base';
import { RegisteredLogger } from '../../logger/constants';
import { InstrumentClass } from '../../telemetry';
import type { AttentionValue, Atom } from './types';

/**
 * Configuration for the attention bank
 */
export interface AttentionBankConfig {
  name: string;
  totalSTI: number; // Total short-term importance budget
  totalLTI: number; // Total long-term importance budget
  focusThreshold: number; // STI threshold for attention focus
  forgettingThreshold: number; // STI threshold below which atoms may be forgotten
  maxAttentionAtoms: number; // Maximum atoms in attention focus
  decayRate: number; // Rate at which attention decays
  spreadingRate: number; // Rate at which attention spreads
}

/**
 * Manages attention allocation in the cognitive architecture
 */
@InstrumentClass({
  prefix: 'attention-bank',
  excludeMethods: ['__setLogger', '__setTelemetry'],
})
export class AttentionBank extends MastraBase {
  #attentionValues: Map<string, AttentionValue>;
  #config: AttentionBankConfig;
  #totalSTIAllocated: number;
  #totalLTIAllocated: number;
  #focusedAtoms: Set<string>;
  #spreadingHistory: Map<string, number>;

  constructor(config: AttentionBankConfig) {
    super({ component: RegisteredLogger.ATTENTION, name: config.name });
    
    this.#attentionValues = new Map();
    this.#config = config;
    this.#totalSTIAllocated = 0;
    this.#totalLTIAllocated = 0;
    this.#focusedAtoms = new Set();
    this.#spreadingHistory = new Map();

    // Start attention dynamics cycle
    this.#startAttentionCycle();
  }

  /**
   * Allocate attention to an atom
   */
  public allocateAttention(
    atomId: string, 
    stiDelta: number = 0, 
    ltiDelta: number = 0, 
    vltiDelta: number = 0
  ): AttentionValue {
    const current = this.#attentionValues.get(atomId) || { sti: 0, lti: 0, vlti: 0 };
    
    // Ensure we don't exceed total budget
    const newSTI = Math.max(-1000, Math.min(1000, current.sti + stiDelta));
    const newLTI = Math.max(-1000, Math.min(1000, current.lti + ltiDelta));
    const newVLTI = Math.max(0, Math.min(1, current.vlti + vltiDelta));

    // Update budget tracking
    this.#totalSTIAllocated = this.#totalSTIAllocated - current.sti + newSTI;
    this.#totalLTIAllocated = this.#totalLTIAllocated - current.lti + newLTI;

    // Enforce budget constraints
    if (this.#totalSTIAllocated > this.#config.totalSTI) {
      const excess = this.#totalSTIAllocated - this.#config.totalSTI;
      this.#redistributeSTI(excess);
    }

    const newAttention: AttentionValue = {
      sti: newSTI,
      lti: newLTI,
      vlti: newVLTI,
    };

    this.#attentionValues.set(atomId, newAttention);

    // Update focused atoms set
    this.#updateFocusedAtoms(atomId, newAttention);

    this.logger?.debug('Attention allocated', { 
      atomId, 
      attention: newAttention,
      totalSTI: this.#totalSTIAllocated,
      totalLTI: this.#totalLTIAllocated,
    });

    return newAttention;
  }

  /**
   * Get attention value for an atom
   */
  public getAttentionValue(atomId: string): AttentionValue | undefined {
    return this.#attentionValues.get(atomId);
  }

  /**
   * Get atoms currently in attention focus
   */
  public getFocusedAtoms(): string[] {
    return Array.from(this.#focusedAtoms);
  }

  /**
   * Get top N atoms by STI
   */
  public getTopAttentionAtoms(limit: number = 10): Array<{ atomId: string; attention: AttentionValue }> {
    return Array.from(this.#attentionValues.entries())
      .map(([atomId, attention]) => ({ atomId, attention }))
      .sort((a, b) => b.attention.sti - a.attention.sti)
      .slice(0, limit);
  }

  /**
   * Spread attention from source atom to related atoms
   */
  public spreadAttention(sourceAtomId: string, relatedAtomIds: string[], spreadFactor: number = 0.1): void {
    const sourceAttention = this.#attentionValues.get(sourceAtomId);
    if (!sourceAttention || sourceAttention.sti <= 0) return;

    const attentionToSpread = sourceAttention.sti * spreadFactor * this.#config.spreadingRate;
    const perAtomSpread = attentionToSpread / relatedAtomIds.length;

    // Reduce attention from source
    this.allocateAttention(sourceAtomId, -attentionToSpread);

    // Spread to related atoms
    for (const relatedId of relatedAtomIds) {
      this.allocateAttention(relatedId, perAtomSpread);
      this.#spreadingHistory.set(relatedId, Date.now());
    }

    this.logger?.debug('Attention spread', {
      source: sourceAtomId,
      targets: relatedAtomIds.length,
      spreadAmount: attentionToSpread,
    });
  }

  /**
   * Stimulus-driven attention allocation
   */
  public stimulate(atomId: string, stimulus: number): void {
    // Convert stimulus to STI increase
    const stiIncrease = Math.min(100, stimulus * 10);
    this.allocateAttention(atomId, stiIncrease);
    
    this.logger?.debug('Atom stimulated', { atomId, stimulus, stiIncrease });
  }

  /**
   * Importance-driven attention reallocation
   */
  public updateImportance(atomId: string, importance: number): void {
    const current = this.#attentionValues.get(atomId) || { sti: 0, lti: 0, vlti: 0 };
    
    // Convert importance to LTI adjustment
    const ltiAdjustment = (importance - 0.5) * 200; // Scale [-100, 100]
    this.allocateAttention(atomId, 0, ltiAdjustment);
    
    this.logger?.debug('Importance updated', { atomId, importance, ltiAdjustment });
  }

  /**
   * Forgetting mechanism - remove low-attention atoms
   */
  public forgetLowAttentionAtoms(): string[] {
    const forgotten: string[] = [];
    
    for (const [atomId, attention] of this.#attentionValues.entries()) {
      if (attention.sti < this.#config.forgettingThreshold && 
          attention.lti < this.#config.forgettingThreshold &&
          attention.vlti < 0.1) {
        this.#attentionValues.delete(atomId);
        this.#focusedAtoms.delete(atomId);
        forgotten.push(atomId);
      }
    }

    if (forgotten.length > 0) {
      this.logger?.info('Atoms forgotten due to low attention', { count: forgotten.length });
    }

    return forgotten;
  }

  /**
   * Get attention bank statistics
   */
  public getStatistics(): {
    totalAtoms: number;
    focusedAtoms: number;
    totalSTIAllocated: number;
    totalLTIAllocated: number;
    averageSTI: number;
    averageLTI: number;
    attentionDistribution: { high: number; medium: number; low: number };
  } {
    const atoms = Array.from(this.#attentionValues.values());
    const totalSTI = atoms.reduce((sum, av) => sum + av.sti, 0);
    const totalLTI = atoms.reduce((sum, av) => sum + av.lti, 0);

    const distribution = { high: 0, medium: 0, low: 0 };
    for (const attention of atoms) {
      if (attention.sti > this.#config.focusThreshold) {
        distribution.high++;
      } else if (attention.sti > 0) {
        distribution.medium++;
      } else {
        distribution.low++;
      }
    }

    return {
      totalAtoms: atoms.length,
      focusedAtoms: this.#focusedAtoms.size,
      totalSTIAllocated: this.#totalSTIAllocated,
      totalLTIAllocated: this.#totalLTIAllocated,
      averageSTI: atoms.length > 0 ? totalSTI / atoms.length : 0,
      averageLTI: atoms.length > 0 ? totalLTI / atoms.length : 0,
      attentionDistribution: distribution,
    };
  }

  /**
   * Update focused atoms based on attention thresholds
   */
  #updateFocusedAtoms(atomId: string, attention: AttentionValue): void {
    if (attention.sti >= this.#config.focusThreshold) {
      this.#focusedAtoms.add(atomId);
    } else {
      this.#focusedAtoms.delete(atomId);
    }

    // Maintain maximum focused atoms limit
    if (this.#focusedAtoms.size > this.#config.maxAttentionAtoms) {
      const sortedAtoms = Array.from(this.#focusedAtoms)
        .map(id => ({ id, sti: this.#attentionValues.get(id)?.sti || 0 }))
        .sort((a, b) => b.sti - a.sti);

      // Remove lowest STI atoms
      const toRemove = sortedAtoms.slice(this.#config.maxAttentionAtoms);
      for (const atom of toRemove) {
        this.#focusedAtoms.delete(atom.id);
      }
    }
  }

  /**
   * Redistribute STI when budget is exceeded
   */
  #redistributeSTI(excessSTI: number): void {
    const atomsWithSTI = Array.from(this.#attentionValues.entries())
      .filter(([_, av]) => av.sti > 0)
      .sort(([_, a], [__, b]) => a.sti - b.sti); // Sort by STI ascending

    let remaining = excessSTI;
    for (const [atomId, attention] of atomsWithSTI) {
      if (remaining <= 0) break;
      
      const reduction = Math.min(remaining, attention.sti * 0.1); // Remove up to 10%
      this.#attentionValues.set(atomId, {
        ...attention,
        sti: attention.sti - reduction,
      });
      remaining -= reduction;
      this.#totalSTIAllocated -= reduction;
    }
  }

  /**
   * Start the attention dynamics cycle
   */
  #startAttentionCycle(): void {
    setInterval(() => {
      this.#runAttentionDecay();
      this.#runAttentionSpreading();
      this.forgetLowAttentionAtoms();
    }, 10000); // Run every 10 seconds
  }

  /**
   * Apply attention decay
   */
  #runAttentionDecay(): void {
    for (const [atomId, attention] of this.#attentionValues.entries()) {
      const stiDecay = attention.sti * this.#config.decayRate;
      const ltiDecay = attention.lti * this.#config.decayRate * 0.1; // LTI decays slower
      
      this.#attentionValues.set(atomId, {
        sti: Math.max(0, attention.sti - stiDecay),
        lti: Math.max(0, attention.lti - ltiDecay),
        vlti: attention.vlti, // VLTI doesn't decay automatically
      });
    }
  }

  /**
   * Run automated attention spreading
   */
  #runAttentionSpreading(): void {
    // This would be connected to the AtomSpace to spread attention
    // along atom relationships - simplified for now
    this.logger?.debug('Attention spreading cycle completed');
  }
}

