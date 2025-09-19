// Cognitive types placeholder file
// Future types for cognitive functionality

/**
 * Truth value representing confidence and strength in an atom
 */
export interface TruthValue {
  strength: number; // [0, 1] - confidence in the truth of the atom
  confidence: number; // [0, 1] - reliability of the strength value
  count: number; // Evidence count supporting this truth value
}

/**
 * Atom types in the cognitive architecture
 */
export type AtomType =
  | 'concept'
  | 'predicate'
  | 'evaluation'
  | 'inheritance'
  | 'similarity'
  | 'implication'
  | 'equivalence'
  | 'and'
  | 'or'
  | 'not'
  | 'forall'
  | 'exists';

/**
 * Base atom representing a piece of knowledge in the AtomSpace
 */
export interface Atom {
  id: string;
  type: AtomType;
  name?: string;
  truthValue: TruthValue;
  outgoing?: string[]; // IDs of atoms this atom links to
  incoming?: string[]; // IDs of atoms that link to this atom
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Attention value for an atom in the attention allocation system
 */
export interface AttentionValue {
  sti: number; // Short-term importance [-1000, 1000]
  lti: number; // Long-term importance [-1000, 1000]
  vlti: number; // Very long-term importance [0, 1]
}

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
 * Context for cognitive operations
 */
export interface CognitiveContext {
  requestId: string;
  fromEntityId: string;
  requestType: 'cognitive-inference' | 'attention-allocation' | 'knowledge-query' | 'learning';
  payload: {
    query?: string;
    atoms?: Atom[];
    targetConcepts?: string[];
    inferenceRules?: string[];
    attentionBudget?: number;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

/**
 * Result of cognitive operations
 */
export interface CognitiveResult {
  success: boolean;
  data?: {
    inferredAtoms?: Atom[];
    attentionUpdates?: Array<{ atomId: string; attention: AttentionValue }>;
    conclusions?: string[];
    confidence?: number;
    [key: string]: any;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    executionTime: number;
    resourcesUsed: string[];
    [key: string]: any;
  };
}
