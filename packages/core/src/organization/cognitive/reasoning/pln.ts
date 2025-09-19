import { randomUUID } from 'crypto';
import { MastraBase } from '../../../base';
import { RegisteredLogger } from '../../../logger/constants';
import { InstrumentClass } from '../../../telemetry';
import type { Atom, TruthValue } from '../types';

/**
 * PLN inference rule types
 */
export type PLNInferenceRule =
  | 'deduction'
  | 'induction'
  | 'abduction'
  | 'modus-ponens'
  | 'modus-tollens'
  | 'hypothetical-syllogism'
  | 'disjunctive-syllogism'
  | 'simplification'
  | 'conjunction'
  | 'disjunction';

/**
 * Inference result containing derived atoms and confidence
 */
export interface InferenceResult {
  derivedAtoms: Atom[];
  rule: PLNInferenceRule;
  premises: string[]; // IDs of premise atoms
  confidence: number;
  explanation: string;
}

/**
 * Configuration for PLN reasoner
 */
export interface PLNReasonerConfig {
  name: string;
  maxInferenceDepth: number;
  minConfidenceThreshold: number;
  maxInferencesPerStep: number;
  enableProbabilisticLogic: boolean;
}

/**
 * Probabilistic Logic Networks (PLN) reasoner for distributed inference
 */
@InstrumentClass({
  prefix: 'pln-reasoner',
  excludeMethods: ['__setLogger', '__setTelemetry'],
})
export class PLNReasoner extends MastraBase {
  #config: PLNReasonerConfig;
  #inferenceHistory: Map<string, InferenceResult[]>;
  #activeInferences: Set<string>;

  constructor(config: PLNReasonerConfig) {
    super({ component: RegisteredLogger.PLN_REASONER, name: config.name });

    this.#config = config;
    this.#inferenceHistory = new Map();
    this.#activeInferences = new Set();
  }

  /**
   * Perform inference on a set of atoms
   */
  public async performInference(
    atoms: Atom[],
    targetConcepts?: string[],
    rules?: PLNInferenceRule[],
  ): Promise<InferenceResult[]> {
    const inferenceId = randomUUID();
    this.#activeInferences.add(inferenceId);

    try {
      const results: InferenceResult[] = [];
      const rulesToApply = rules || ['deduction', 'induction', 'modus-ponens', 'conjunction'];

      for (const rule of rulesToApply) {
        const ruleResults = await this.#applyRule(rule, atoms, targetConcepts);
        results.push(...ruleResults);

        // Stop if we have enough inferences
        if (results.length >= this.#config.maxInferencesPerStep) break;
      }

      // Filter by confidence threshold
      const validResults = results.filter(result => result.confidence >= this.#config.minConfidenceThreshold);

      this.#inferenceHistory.set(inferenceId, validResults);
      this.logger?.info('PLN inference completed', {
        inferenceId,
        atomCount: atoms.length,
        rulesApplied: rulesToApply.length,
        derivedAtoms: validResults.reduce((sum, r) => sum + r.derivedAtoms.length, 0),
      });

      return validResults;
    } finally {
      this.#activeInferences.delete(inferenceId);
    }
  }

  /**
   * Apply deduction rule: If A → B and B → C, then A → C
   */
  public async applyDeduction(atoms: Atom[]): Promise<InferenceResult[]> {
    const results: InferenceResult[] = [];
    const implications = atoms.filter(atom => atom.type === 'implication');

    for (let i = 0; i < implications.length; i++) {
      for (let j = i + 1; j < implications.length; j++) {
        const imp1 = implications[i];
        const imp2 = implications[j];

        if (
          imp1?.outgoing &&
          imp2?.outgoing &&
          imp1.outgoing.length >= 2 &&
          imp2.outgoing.length >= 2 &&
          imp1.outgoing[1] === imp2.outgoing[0]
        ) {
          const antecedent = imp1.outgoing[0];
          const consequent = imp2.outgoing[1];

          if (antecedent && consequent) {
            const newAtom = await this.#createImplicationAtom(
              antecedent,
              consequent,
              this.#combineDeductiveTruthValues(imp1.truthValue, imp2.truthValue),
            );

            results.push({
              derivedAtoms: [newAtom],
              rule: 'deduction',
              premises: [imp1.id, imp2.id],
              confidence: newAtom.truthValue.confidence,
              explanation: `Deduced ${antecedent} → ${consequent} from transitivity`,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Apply induction rule: If A → B observed in multiple cases, strengthen A → B
   */
  public async applyInduction(atoms: Atom[]): Promise<InferenceResult[]> {
    const results: InferenceResult[] = [];
    const evaluations = atoms.filter(atom => atom.type === 'evaluation');
    const _implications = atoms.filter(atom => atom.type === 'implication');

    // Group evaluations by predicate patterns
    const patternGroups = new Map<string, Atom[]>();
    for (const evaluation of evaluations) {
      if (evaluation.outgoing && evaluation.outgoing.length >= 2) {
        const pattern = evaluation.outgoing[0]; // Predicate
        if (pattern) {
          if (!patternGroups.has(pattern)) {
            patternGroups.set(pattern, []);
          }
          patternGroups.get(pattern)!.push(evaluation);
        }
      }
    }

    // Look for inductive patterns
    for (const [pattern, evaluations] of patternGroups.entries()) {
      if (evaluations.length >= 3) {
        // Need multiple instances for induction
        const avgStrength = evaluations.reduce((sum, e) => sum + e.truthValue.strength, 0) / evaluations.length;
        const avgConfidence = Math.min(0.9, evaluations.length * 0.1); // Confidence grows with instances

        if (avgStrength > 0.6) {
          const generalizedAtom = await this.#createGeneralRule(pattern, {
            strength: avgStrength,
            confidence: avgConfidence,
            count: evaluations.length,
          });

          results.push({
            derivedAtoms: [generalizedAtom],
            rule: 'induction',
            premises: evaluations.map(e => e.id),
            confidence: avgConfidence,
            explanation: `Induced general rule from ${evaluations.length} instances`,
          });
        }
      }
    }

    return results;
  }

  /**
   * Apply modus ponens: If A → B and A, then B
   */
  public async applyModusPonens(atoms: Atom[]): Promise<InferenceResult[]> {
    const results: InferenceResult[] = [];
    const implications = atoms.filter(atom => atom.type === 'implication');
    const concepts = atoms.filter(atom => atom.type === 'concept');

    for (const implication of implications) {
      if (!implication.outgoing || implication.outgoing.length < 2) continue;

      const antecedent = implication.outgoing[0];
      const consequent = implication.outgoing[1];

      if (!antecedent || !consequent) continue;

      // Find matching concept for antecedent
      const matchingConcept = concepts.find(c => c.id === antecedent);
      if (matchingConcept && matchingConcept.truthValue.strength > 0.5) {
        const consequentAtom =
          concepts.find(c => c.id === consequent) ||
          (await this.#createConceptAtom(
            consequent,
            this.#combineModusPonensTruthValues(implication.truthValue, matchingConcept.truthValue),
          ));

        results.push({
          derivedAtoms: [consequentAtom],
          rule: 'modus-ponens',
          premises: [implication.id, matchingConcept.id],
          confidence: consequentAtom.truthValue.confidence,
          explanation: `Applied modus ponens: ${antecedent} → ${consequent}, ${antecedent} ⊢ ${consequent}`,
        });
      }
    }

    return results;
  }

  /**
   * Apply conjunction rule: If A and B, then A ∧ B
   */
  public async applyConjunction(atoms: Atom[]): Promise<InferenceResult[]> {
    const results: InferenceResult[] = [];
    const concepts = atoms.filter(atom => atom.type === 'concept' && atom.truthValue.strength > 0.5);

    // Create conjunctions of compatible concepts
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const concept1 = concepts[i];
        const concept2 = concepts[j];

        if (concept1 && concept2 && this.#areConceptsCompatible(concept1, concept2)) {
          const conjunctionAtom = await this.#createConjunctionAtom(
            concept1.id,
            concept2.id,
            this.#combineConjunctionTruthValues(concept1.truthValue, concept2.truthValue),
          );

          results.push({
            derivedAtoms: [conjunctionAtom],
            rule: 'conjunction',
            premises: [concept1.id, concept2.id],
            confidence: conjunctionAtom.truthValue.confidence,
            explanation: `Created conjunction: ${concept1.name || concept1.type} ∧ ${concept2.name || concept2.type}`,
          });
        }
      }
    }

    return results;
  }

  /**
   * Apply specific inference rule
   */
  async #applyRule(rule: PLNInferenceRule, atoms: Atom[], _targetConcepts?: string[]): Promise<InferenceResult[]> {
    switch (rule) {
      case 'deduction':
        return this.applyDeduction(atoms);
      case 'induction':
        return this.applyInduction(atoms);
      case 'modus-ponens':
        return this.applyModusPonens(atoms);
      case 'conjunction':
        return this.applyConjunction(atoms);
      default:
        this.logger?.warn('Unsupported inference rule', { rule });
        return [];
    }
  }

  /**
   * Combine truth values for deductive inference
   */
  #combineDeductiveTruthValues(tv1: TruthValue, tv2: TruthValue): TruthValue {
    // Deduction formula: strength = s1 * s2, confidence = c1 * c2 * s1 * s2
    const strength = tv1.strength * tv2.strength;
    const confidence = tv1.confidence * tv2.confidence * tv1.strength * tv2.strength;

    return {
      strength: Math.max(0, Math.min(1, strength)),
      confidence: Math.max(0, Math.min(1, confidence)),
      count: Math.min(tv1.count, tv2.count),
    };
  }

  /**
   * Combine truth values for modus ponens
   */
  #combineModusPonensTruthValues(tvImplication: TruthValue, tvAntecedent: TruthValue): TruthValue {
    const strength = tvImplication.strength * tvAntecedent.strength;
    const confidence = tvImplication.confidence * tvAntecedent.confidence;

    return {
      strength: Math.max(0, Math.min(1, strength)),
      confidence: Math.max(0, Math.min(1, confidence)),
      count: Math.min(tvImplication.count, tvAntecedent.count),
    };
  }

  /**
   * Combine truth values for conjunction
   */
  #combineConjunctionTruthValues(tv1: TruthValue, tv2: TruthValue): TruthValue {
    const strength = tv1.strength * tv2.strength;
    const confidence = Math.min(tv1.confidence, tv2.confidence);

    return {
      strength: Math.max(0, Math.min(1, strength)),
      confidence: Math.max(0, Math.min(1, confidence)),
      count: Math.max(tv1.count, tv2.count),
    };
  }

  /**
   * Create implication atom
   */
  async #createImplicationAtom(antecedent: string, consequent: string, truthValue: TruthValue): Promise<Atom> {
    return {
      id: randomUUID(),
      type: 'implication',
      truthValue,
      outgoing: [antecedent, consequent],
      incoming: [],
      metadata: { derived: true, rule: 'deduction' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Create concept atom
   */
  async #createConceptAtom(conceptId: string, truthValue: TruthValue): Promise<Atom> {
    return {
      id: conceptId,
      type: 'concept',
      name: conceptId,
      truthValue,
      outgoing: [],
      incoming: [],
      metadata: { derived: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Create conjunction atom
   */
  async #createConjunctionAtom(concept1: string, concept2: string, truthValue: TruthValue): Promise<Atom> {
    return {
      id: randomUUID(),
      type: 'and',
      truthValue,
      outgoing: [concept1, concept2],
      incoming: [],
      metadata: { derived: true, rule: 'conjunction' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Create general rule from pattern
   */
  async #createGeneralRule(pattern: string, truthValue: TruthValue): Promise<Atom> {
    return {
      id: randomUUID(),
      type: 'implication',
      name: `general_rule_${pattern}`,
      truthValue,
      outgoing: [],
      incoming: [],
      metadata: { derived: true, rule: 'induction', pattern },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Check if two concepts are compatible for conjunction
   */
  #areConceptsCompatible(concept1: Atom, concept2: Atom): boolean {
    // Simple compatibility check - in practice this would be more sophisticated
    return concept1.id !== concept2.id && concept1.truthValue.confidence > 0.3 && concept2.truthValue.confidence > 0.3;
  }
}
