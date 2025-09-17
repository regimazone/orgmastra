import { describe, test, expect } from 'vitest';
import { AtomSpace } from './atomspace';
import { AttentionBank } from './attention';
import { PLNReasoner } from './reasoning/pln';

describe('Cognitive Architecture Components', () => {
  test('AtomSpace should create and manage atoms', async () => {
    const atomSpace = new AtomSpace({ name: 'test-atomspace' });

    // Create a concept atom
    const concept = await atomSpace.addAtom('concept', 'learning', [], { strength: 0.8, confidence: 0.7, count: 1 });

    expect(concept.type).toBe('concept');
    expect(concept.name).toBe('learning');
    expect(concept.truthValue.strength).toBe(0.8);
    expect(concept.truthValue.confidence).toBe(0.7);

    // Query atoms by type
    const concepts = atomSpace.getAtomsByType('concept');
    expect(concepts).toHaveLength(1);
    expect(concepts[0].id).toBe(concept.id);

    // Query atoms by name
    const learningAtoms = atomSpace.getAtomsByName('learning');
    expect(learningAtoms).toHaveLength(1);
    expect(learningAtoms[0].id).toBe(concept.id);
  });

  test('AttentionBank should allocate and manage attention', () => {
    const attentionBank = new AttentionBank({
      name: 'test-attention',
      totalSTI: 1000,
      totalLTI: 1000,
      focusThreshold: 50,
      forgettingThreshold: -10,
      maxAttentionAtoms: 10,
      decayRate: 0.01,
      spreadingRate: 0.1,
    });

    const atomId = 'test-atom-123';

    // Allocate attention
    const attention = attentionBank.allocateAttention(atomId, 60, 30, 0.1);

    expect(attention.sti).toBe(60);
    expect(attention.lti).toBe(30);
    expect(attention.vlti).toBe(0.1);

    // Retrieve attention value
    const retrievedAttention = attentionBank.getAttentionValue(atomId);
    expect(retrievedAttention).toEqual(attention);

    // Check focused atoms
    const focusedAtoms = attentionBank.getFocusedAtoms();
    expect(focusedAtoms).toContain(atomId);

    // Test top attention atoms
    const topAtoms = attentionBank.getTopAttentionAtoms(5);
    expect(topAtoms).toHaveLength(1);
    expect(topAtoms[0].atomId).toBe(atomId);
  });

  test('PLNReasoner should perform basic inference', async () => {
    const reasoner = new PLNReasoner({
      name: 'test-reasoner',
      maxInferenceDepth: 2,
      minConfidenceThreshold: 0.3,
      maxInferencesPerStep: 5,
      enableProbabilisticLogic: true,
    });

    // Create test atoms for deduction
    const atomA = {
      id: 'atom-a',
      type: 'concept' as const,
      name: 'A',
      truthValue: { strength: 0.8, confidence: 0.7, count: 1 },
      outgoing: [],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const atomB = {
      id: 'atom-b',
      type: 'concept' as const,
      name: 'B',
      truthValue: { strength: 0.7, confidence: 0.6, count: 1 },
      outgoing: [],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const atomC = {
      id: 'atom-c',
      type: 'concept' as const,
      name: 'C',
      truthValue: { strength: 0.6, confidence: 0.5, count: 1 },
      outgoing: [],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // A → B
    const impAB = {
      id: 'imp-ab',
      type: 'implication' as const,
      truthValue: { strength: 0.9, confidence: 0.8, count: 1 },
      outgoing: [atomA.id, atomB.id],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // B → C
    const impBC = {
      id: 'imp-bc',
      type: 'implication' as const,
      truthValue: { strength: 0.8, confidence: 0.7, count: 1 },
      outgoing: [atomB.id, atomC.id],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const atoms = [atomA, atomB, atomC, impAB, impBC];

    // Test deduction: A→B, B→C should derive A→C
    const deductionResults = await reasoner.applyDeduction(atoms);

    expect(deductionResults.length).toBeGreaterThan(0);
    const result = deductionResults[0];
    expect(result.rule).toBe('deduction');
    expect(result.derivedAtoms).toHaveLength(1);
    expect(result.derivedAtoms[0].type).toBe('implication');
    expect(result.premises).toContain(impAB.id);
    expect(result.premises).toContain(impBC.id);
  });

  test('PLNReasoner should apply modus ponens', async () => {
    const reasoner = new PLNReasoner({
      name: 'test-reasoner',
      maxInferenceDepth: 2,
      minConfidenceThreshold: 0.3,
      maxInferencesPerStep: 5,
      enableProbabilisticLogic: true,
    });

    // Create test atoms: A, A→B should derive B
    const atomA = {
      id: 'atom-a',
      type: 'concept' as const,
      name: 'A',
      truthValue: { strength: 0.9, confidence: 0.8, count: 1 },
      outgoing: [],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const atomB = {
      id: 'atom-b',
      type: 'concept' as const,
      name: 'B',
      truthValue: { strength: 0.1, confidence: 0.1, count: 1 }, // Low initial confidence
      outgoing: [],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const impAB = {
      id: 'imp-ab',
      type: 'implication' as const,
      truthValue: { strength: 0.8, confidence: 0.7, count: 1 },
      outgoing: [atomA.id, atomB.id],
      incoming: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const atoms = [atomA, atomB, impAB];

    const modusResults = await reasoner.applyModusPonens(atoms);

    expect(modusResults.length).toBeGreaterThan(0);
    const result = modusResults[0];
    expect(result.rule).toBe('modus-ponens');
    expect(result.premises).toContain(impAB.id);
    expect(result.premises).toContain(atomA.id);
  });
});
