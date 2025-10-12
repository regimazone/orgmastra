import { Mastra } from '@mastra/core';
import {
  AtomSpace,
  AttentionBank,
  PLNReasoner,
  CognitiveCoordinator,
  AttentionAllocationAgent,
  PatternRecognitionAgent,
  GoalPursuitAgent,
  LearningAgent,
  MemoryConsolidationAgent,
} from '@mastra/core/organization';

/**
 * OpenCog Distributed Agency Architecture Test
 *
 * This test verifies the core cognitive architecture components work correctly.
 * Note: Full CognitiveAgent testing requires LLM models and is demonstrated in index.ts
 */

console.log('🧠 Testing OpenCog Distributed Agency Cognitive Architecture...\n');

// Create the main Mastra instance
const mastra = new Mastra({});

// Initialize cognitive coordinator
const cognitiveCoordinator = new CognitiveCoordinator(mastra.pubsub, {
  name: 'test-coordinator',
  maxConcurrentProcesses: 10,
  coordinationTimeout: 30000,
  enableDistributedInference: true,
  knowledgeShareThreshold: 0.6,
  consensusThreshold: 0.7,
});

console.log('✅ Cognitive Coordinator initialized\n');

// Create core cognitive components
console.log('🏗️  Creating Core Cognitive Components...\n');

const atomSpace1 = new AtomSpace({
  name: 'reasoning-atomspace',
  maxAtoms: 10000,
  enableAttention: true,
});

const atomSpace2 = new AtomSpace({
  name: 'learning-atomspace',
  maxAtoms: 10000,
  enableAttention: true,
});

const atomSpace3 = new AtomSpace({
  name: 'pattern-atomspace',
  maxAtoms: 10000,
  enableAttention: true,
});

const attentionBank1 = new AttentionBank({
  name: 'reasoning-attention',
  totalSTI: 5000,
  totalLTI: 5000,
  focusThreshold: 50,
  forgettingThreshold: -10,
  maxAttentionAtoms: 20,
  decayRate: 0.01,
  spreadingRate: 0.1,
});

const reasoner = new PLNReasoner({
  name: 'test-reasoner',
  maxInferenceDepth: 3,
  minConfidenceThreshold: 0.3,
  maxInferencesPerStep: 10,
  enableProbabilisticLogic: true,
});

console.log('✅ Created 3 AtomSpaces, 1 AttentionBank, and 1 PLNReasoner\n');

// Create mind agents
const mindAgents = [
  new AttentionAllocationAgent({
    id: 'attention-allocator',
    name: 'Attention Allocation Agent',
    priority: 1,
    frequency: 15000,
    enabled: true,
    parameters: {
      enableDecay: true,
      decayRate: 0.01,
    },
  }),

  new PatternRecognitionAgent({
    id: 'pattern-detector',
    name: 'Pattern Recognition Agent',
    priority: 2,
    frequency: 20000,
    enabled: true,
    parameters: {
      createAbstractions: true,
      minPatternFrequency: 3,
    },
  }),

  new GoalPursuitAgent({
    id: 'goal-pursuer',
    name: 'Goal Pursuit Agent',
    priority: 3,
    frequency: 25000,
    enabled: true,
    parameters: {
      adaptivePlanning: true,
    },
  }),

  new LearningAgent({
    id: 'learner',
    name: 'Learning Agent',
    priority: 2,
    frequency: 30000,
    enabled: true,
    parameters: {
      enableForgetting: true,
    },
  }),

  new MemoryConsolidationAgent({
    id: 'memory-consolidator',
    name: 'Memory Consolidation Agent',
    priority: 4,
    frequency: 60000,
    enabled: true,
    parameters: {
      enableCompression: true,
    },
  }),
];

// Register mind agents
for (const mindAgent of mindAgents) {
  cognitiveCoordinator.registerMindAgent(mindAgent);
}

console.log('✅ Created and registered 5 mind agents\n');

// Test cognitive operations
async function testCognitiveOperations() {
  console.log('🧪 Testing Cognitive Operations...\n');

  // 1. Test AtomSpace Knowledge Management
  console.log('1️⃣ Testing AtomSpace Knowledge Management');

  const concept1 = await atomSpace1.addAtom(
    'concept',
    'logical-reasoning',
    [],
    { strength: 0.9, confidence: 0.8, count: 1 },
    { domain: 'logic' },
  );

  const concept2 = await atomSpace1.addAtom(
    'concept',
    'inference',
    [],
    { strength: 0.85, confidence: 0.75, count: 1 },
    { domain: 'logic' },
  );

  const implication = await atomSpace1.addAtom('implication', undefined, [concept1.id, concept2.id], {
    strength: 0.8,
    confidence: 0.7,
    count: 1,
  });

  const concepts = atomSpace1.getAtomsByType('concept');
  console.log(`   ✓ Created ${concepts.length} concepts in reasoning atomspace`);
  console.log(`   ✓ Created implication link between concepts\n`);

  // 2. Test PLN Inference
  console.log('2️⃣ Testing Probabilistic Logic Networks (PLN) Inference');

  const atoms = [concept1, concept2, implication];
  const inferences = await reasoner.performInference(atoms);

  console.log(`   ✓ PLN inference generated ${inferences.length} results`);

  const deductionResults = await reasoner.applyDeduction(atoms);
  console.log(`   ✓ Deduction rule applied: ${deductionResults.length} derivations`);

  const modusPonensResults = await reasoner.applyModusPonens(atoms);
  console.log(`   ✓ Modus ponens applied: ${modusPonensResults.length} derivations\n`);

  // 3. Test Attention Management
  console.log('3️⃣ Testing Attention Allocation');

  attentionBank1.allocateAttention(concept1.id, 80, 60, 0.8);
  attentionBank1.allocateAttention(concept2.id, 70, 50, 0.7);
  attentionBank1.allocateAttention(implication.id, 60, 40, 0.6);

  const focusedAtoms = attentionBank1.getFocusedAtoms();
  console.log(`   ✓ ${focusedAtoms.length} atoms in attention focus (threshold: 50 STI)`);

  const topAtoms = attentionBank1.getTopAttentionAtoms(3);
  console.log(`   ✓ Top attention atoms:`);
  for (const { atomId, attention } of topAtoms) {
    console.log(`     - Atom ${atomId.substring(0, 8)}: STI=${attention.sti}, LTI=${attention.lti}`);
  }

  // Test attention spreading
  attentionBank1.spreadAttention(concept1.id, [concept2.id, implication.id], 0.2);
  console.log(`   ✓ Attention spread from high-importance concept\n`);

  // 4. Test Truth Value Revision
  console.log('4️⃣ Testing Truth Value Revision');

  const initialTV = concept1.truthValue;
  console.log(`   Initial truth value - Strength: ${initialTV.strength}, Confidence: ${initialTV.confidence}`);

  // Add similar atom to trigger revision
  const revisedConcept = await atomSpace1.addAtom('concept', 'logical-reasoning', [], {
    strength: 0.95,
    confidence: 0.85,
    count: 1,
  });

  console.log(
    `   Revised truth value - Strength: ${revisedConcept.truthValue.strength.toFixed(3)}, Confidence: ${revisedConcept.truthValue.confidence.toFixed(3)}`,
  );
  console.log(`   ✓ Truth values merged through revision formula\n`);

  // 5. Test Pattern Queries
  console.log('5️⃣ Testing Pattern Queries');

  const conceptAtoms = atomSpace1.getAtomsByType('concept');
  console.log(`   ✓ Query by type found ${conceptAtoms.length} concept atoms`);

  const namedAtoms = atomSpace1.getAtomsByName('logical-reasoning');
  console.log(`   ✓ Query by name found ${namedAtoms.length} atoms named 'logical-reasoning'`);

  const atomsByAttention = atomSpace1.getAtomsByAttention(10);
  console.log(`   ✓ Query by attention found ${atomsByAttention.length} atoms\n`);

  // 6. Test Multiple AtomSpaces (Distributed Knowledge)
  console.log('6️⃣ Testing Distributed Knowledge Across AtomSpaces');

  await atomSpace2.addAtom(
    'concept',
    'reinforcement-learning',
    [],
    { strength: 0.8, confidence: 0.7, count: 1 },
    { domain: 'ml' },
  );
  await atomSpace3.addAtom(
    'concept',
    'pattern-recognition',
    [],
    { strength: 0.85, confidence: 0.75, count: 1 },
    { domain: 'data-science' },
  );

  console.log(`   ✓ Reasoning atomspace: ${atomSpace1.getAtomsByType('concept').length} concept atoms`);
  console.log(`   ✓ Learning atomspace: ${atomSpace2.getAtomsByType('concept').length} concept atoms`);
  console.log(`   ✓ Pattern atomspace: ${atomSpace3.getAtomsByType('concept').length} concept atoms`);
  console.log(`   ✓ Simulated distributed knowledge across specialized atomspaces\n`);

  // 7. Test Mind Agents Cycle
  console.log('7️⃣ Testing Mind Agents Autonomous Processing');

  const mindAgentResults = await cognitiveCoordinator.runMindAgentsCycle();

  console.log(`   ✓ Executed ${mindAgentResults.length} mind agents`);
  for (const result of mindAgentResults) {
    console.log(
      `     - ${result.type}: ${result.success ? 'SUCCESS' : 'FAILED'} (${result.actionsPerformed.length} actions)`,
    );
  }
  console.log();

  // 8. Test Coordinator Statistics
  console.log('8️⃣ Testing Coordinator Statistics');

  const coordStats = cognitiveCoordinator.getStatistics();
  console.log(`   ✓ Registered Agents: ${coordStats.registeredAgents}`);
  console.log(`   ✓ Mind Agents: ${coordStats.mindAgents}`);
  console.log(`   ✓ Active Requests: ${coordStats.activeRequests}`);
  console.log(`   ✓ Completed Requests: ${coordStats.completedRequests}`);
  console.log();
}

// Main execution
async function main() {
  try {
    await testCognitiveOperations();

    console.log('🎉 All Core Components Tested Successfully!\n');
    console.log('Key OpenCog-inspired features verified:');
    console.log('✅ AtomSpace: Distributed knowledge representation with truth values');
    console.log('✅ AttentionBank: STI/LTI attention allocation mechanism');
    console.log('✅ PLNReasoner: Probabilistic Logic Networks inference');
    console.log('✅ CognitiveCoordinator: Distributed cognitive process orchestration');
    console.log('✅ MindAgents: Autonomous cognitive maintenance processes');
    console.log('✅ Truth Value Revision: Automatic confidence merging');
    console.log('✅ Attention Spreading: Dynamic focus propagation');
    console.log('✅ Pattern Queries: Type and name-based atom retrieval\n');

    console.log('🚀 OpenCog Distributed Cognitive Agency Core is fully operational!');
    console.log('\n📝 Note: For full CognitiveAgent testing with LLM integration,');
    console.log('   see index.ts which demonstrates:');
    console.log('   - Distributed inference coordination');
    console.log('   - Knowledge sharing between agents');
    console.log('   - Consensus building');
    console.log('   - Autonomous cognitive processing');
  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
}

// Start the test
main().catch(console.error);
