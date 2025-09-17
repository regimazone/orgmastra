import { Mastra } from '@mastra/core';
import { openai } from '@ai-sdk/openai';
import {
  CognitiveAgent,
  CognitiveCoordinator,
  AttentionAllocationAgent,
  PatternRecognitionAgent,
  GoalPursuitAgent,
  LearningAgent,
  MemoryConsolidationAgent,
  type CognitiveAgentConfig,
} from '@mastra/core/organization';

/**
 * OpenCog Distributed Agency Cognitive Architecture Example
 * 
 * This example demonstrates:
 * 1. Multiple cognitive agents with specialized capabilities
 * 2. Distributed inference and knowledge sharing
 * 3. Attention allocation and mind agents
 * 4. Consensus building and collective decision making
 * 5. Autonomous cognitive processing
 */

console.log('🧠 Initializing OpenCog Distributed Agency Cognitive Architecture...\n');

// Create the main Mastra instance
const mastra = new Mastra({
  // Will register cognitive components separately
});

// Initialize cognitive coordinator
const cognitiveCoordinator = new CognitiveCoordinator(mastra.pubsub, {
  name: 'opencog-coordinator',
  maxConcurrentProcesses: 10,
  coordinationTimeout: 30000,
  enableDistributedInference: true,
  knowledgeShareThreshold: 0.6,
  consensusThreshold: 0.7,
});

console.log('🎯 Creating specialized cognitive agents...\n');

// Create cognitive agents with different specializations
const cognitiveAgents: CognitiveAgent[] = [];

// Reasoning Specialist Agent
const reasoningAgent = new CognitiveAgent({
  id: 'reasoning-specialist',
  name: 'Aristotle',
  description: 'Expert in logical reasoning and inference',
  position: {
    organizationId: 'opencog-collective',
    roleId: 'reasoning-specialist',
  },
  skills: ['logical-reasoning', 'inference', 'pattern-analysis'],
  cognitiveCapabilities: [
    'deductive-reasoning',
    'inductive-reasoning',
    'abductive-reasoning',
    'modus-ponens',
    'syllogistic-reasoning'
  ],
  agentConfig: {
    instructions: 'You are Aristotle, a reasoning specialist in the OpenCog collective. You excel at logical inference, pattern recognition, and drawing sound conclusions from available evidence. Your role is to apply rigorous logical reasoning to help the collective make well-founded decisions.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 3,
    trustedDelegates: ['learning-specialist', 'pattern-expert'],
    supportedProtocols: ['direct', 'broadcast'],
  },
  atomSpaceConfig: {
    maxAtoms: 25000,
    enableAttention: true,
  },
  attentionConfig: {
    totalSTI: 8000,
    focusThreshold: 80,
    maxAttentionAtoms: 40,
  },
  autonomousProcessing: true,
  processingInterval: 25000,
});

// Learning Specialist Agent
const learningAgent = new CognitiveAgent({
  id: 'learning-specialist',
  name: 'Darwin',
  description: 'Expert in learning, adaptation, and evolutionary processes',
  position: {
    organizationId: 'opencog-collective',
    roleId: 'learning-specialist',
  },
  skills: ['machine-learning', 'adaptation', 'evolutionary-algorithms', 'pattern-learning'],
  cognitiveCapabilities: [
    'reinforcement-learning',
    'unsupervised-learning',
    'evolutionary-learning',
    'meta-learning',
    'transfer-learning'
  ],
  agentConfig: {
    instructions: 'You are Darwin, a learning specialist who understands adaptation, evolution, and continuous improvement. You help the collective learn from experience, adapt to new situations, and evolve better strategies over time.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 3,
    trustedDelegates: ['reasoning-specialist', 'pattern-expert'],
    supportedProtocols: ['direct', 'broadcast'],
  },
  autonomousProcessing: true,
  processingInterval: 20000,
});

// Pattern Recognition Expert
const patternAgent = new CognitiveAgent({
  id: 'pattern-expert',
  name: 'Curie',
  description: 'Expert in pattern recognition and data analysis',
  position: {
    organizationId: 'opencog-collective',
    roleId: 'pattern-expert',
  },
  skills: ['pattern-recognition', 'data-analysis', 'signal-processing', 'feature-extraction'],
  cognitiveCapabilities: [
    'visual-pattern-recognition',
    'temporal-pattern-analysis',
    'anomaly-detection',
    'clustering',
    'classification'
  ],
  agentConfig: {
    instructions: 'You are Curie, a pattern recognition expert who excels at identifying hidden structures, correlations, and anomalies in data. You help the collective discover meaningful patterns and insights.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 2,
    trustedDelegates: ['reasoning-specialist', 'learning-specialist'],
    supportedProtocols: ['direct'],
  },
  autonomousProcessing: true,
  processingInterval: 30000,
});

// Creative Problem Solver
const creativityAgent = new CognitiveAgent({
  id: 'creativity-specialist',
  name: 'Tesla',
  description: 'Expert in creative problem solving and innovation',
  position: {
    organizationId: 'opencog-collective',
    roleId: 'creativity-specialist',
  },
  skills: ['creative-thinking', 'innovation', 'brainstorming', 'lateral-thinking'],
  cognitiveCapabilities: [
    'divergent-thinking',
    'analogical-reasoning',
    'creative-synthesis',
    'innovation-generation',
    'conceptual-blending'
  ],
  agentConfig: {
    instructions: 'You are Tesla, a creative genius who thinks outside the box and generates innovative solutions. You help the collective approach problems from novel angles and discover breakthrough insights.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 2,
    trustedDelegates: ['reasoning-specialist', 'pattern-expert'],
    supportedProtocols: ['direct', 'broadcast'],
  },
  autonomousProcessing: true,
  processingInterval: 35000,
});

cognitiveAgents.push(reasoningAgent, learningAgent, patternAgent, creativityAgent);

// Register agents with coordinator
for (const agent of cognitiveAgents) {
  cognitiveCoordinator.registerAgent(agent);
}

console.log('🤖 Initializing mind agents for autonomous processing...\n');

// Create mind agents for autonomous cognitive processes
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
      redistributionThreshold: 0.8,
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
      patternConfidenceThreshold: 0.6,
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
      planningHorizon: 5,
      goalPriorityThreshold: 0.7,
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
      forgettingThreshold: 0.1,
      learningRate: 0.05,
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
      consolidationThreshold: 0.8,
      memoryDecayRate: 0.001,
    },
  }),
];

// Register mind agents
for (const mindAgent of mindAgents) {
  cognitiveCoordinator.registerMindAgent(mindAgent);
}

console.log('📚 Seeding initial knowledge base...\n');

// Seed initial knowledge across agents
async function seedKnowledge() {
  // Add domain knowledge to reasoning agent
  await reasoningAgent.addKnowledge(
    'concept', 
    'logical-reasoning', 
    ['inference', 'deduction', 'syllogism'],
    0.9,
    { domain: 'logic', importance: 'high' }
  );
  
  await reasoningAgent.addKnowledge(
    'implication',
    'if-premise-then-conclusion',
    ['premise', 'conclusion'],
    0.85,
    { rule: 'modus-ponens', domain: 'logic' }
  );

  // Add learning concepts to learning agent
  await learningAgent.addKnowledge(
    'concept',
    'reinforcement-learning',
    ['reward', 'punishment', 'policy'],
    0.8,
    { domain: 'machine-learning', type: 'algorithm' }
  );
  
  await learningAgent.addKnowledge(
    'concept',
    'adaptation',
    ['environment', 'fitness', 'evolution'],
    0.85,
    { domain: 'evolution', principle: 'survival' }
  );

  // Add pattern concepts to pattern agent
  await patternAgent.addKnowledge(
    'concept',
    'pattern-recognition',
    ['feature', 'classification', 'clustering'],
    0.9,
    { domain: 'data-science', application: 'analysis' }
  );

  // Add creativity concepts to creativity agent
  await creativityAgent.addKnowledge(
    'concept',
    'divergent-thinking',
    ['brainstorming', 'alternatives', 'novelty'],
    0.8,
    { domain: 'creativity', process: 'ideation' }
  );

  console.log('✅ Knowledge base seeded successfully!\n');
}

// Demonstrate distributed cognitive operations
async function demonstrateDistributedCognition() {
  console.log('🚀 Demonstrating OpenCog Distributed Agency...\n');

  // Scenario 1: Distributed Inference
  console.log('🔍 Scenario 1: Distributed Inference');
  console.log('Question: "How can we improve learning efficiency in AI systems?"\n');

  const inferenceResult = await cognitiveCoordinator.performDistributedInference(
    'How can we improve learning efficiency in AI systems?',
    ['reasoning-specialist', 'learning-specialist', 'pattern-expert', 'creativity-specialist'],
    30000
  );

  console.log('📊 Inference Results:');
  console.log(`Success: ${inferenceResult.success}`);
  console.log(`Participants: ${inferenceResult.participants.length}`);
  if (inferenceResult.aggregatedResult) {
    console.log(`Conclusions: ${inferenceResult.aggregatedResult.conclusions?.length || 0}`);
    console.log(`Average Confidence: ${(inferenceResult.aggregatedResult.averageConfidence * 100).toFixed(1)}%`);
  }
  console.log();

  // Scenario 2: Knowledge Sharing
  console.log('🔄 Scenario 2: Knowledge Sharing');
  console.log('Sharing pattern recognition knowledge with learning specialist...\n');

  const knowledgeResult = await cognitiveCoordinator.shareKnowledge(
    'pattern-expert',
    ['learning-specialist', 'reasoning-specialist'],
    { minConfidence: 0.7 }
  );

  console.log('📈 Knowledge Sharing Results:');
  console.log(`Success: ${knowledgeResult.success}`);
  if (knowledgeResult.knowledgeTransfer) {
    console.log(`Atoms Shared: ${knowledgeResult.knowledgeTransfer.atomsShared}`);
    console.log('Recipient Updates:', knowledgeResult.knowledgeTransfer.recipientUpdates);
  }
  console.log();

  // Scenario 3: Consensus Building
  console.log('🤝 Scenario 3: Consensus Building');
  console.log('Decision: "What should be the priority focus for cognitive architecture research?"\n');

  const consensusResult = await cognitiveCoordinator.buildConsensus(
    'What should be the priority focus for cognitive architecture research?',
    ['reasoning-specialist', 'learning-specialist', 'pattern-expert', 'creativity-specialist'],
    ['attention-mechanisms', 'knowledge-representation', 'learning-algorithms', 'reasoning-systems'],
    45000
  );

  console.log('🎯 Consensus Results:');
  console.log(`Success: ${consensusResult.success}`);
  if (consensusResult.consensus) {
    console.log(`Final Decision: ${consensusResult.consensus.finalDecision}`);
    console.log(`Agreement Level: ${(consensusResult.consensus.agreement * 100).toFixed(1)}%`);
    console.log(`Dissenting Agents: ${consensusResult.consensus.dissenting.length}`);
  }
  console.log();

  // Scenario 4: Attention Focus Demonstration
  console.log('🎯 Scenario 4: Attention Focus');
  console.log('Focusing collective attention on learning and adaptation...\n');

  // Focus attention on specific concepts
  reasoningAgent.focusAttention(['learning', 'adaptation'], 60);
  learningAgent.focusAttention(['reinforcement-learning', 'adaptation'], 80);
  patternAgent.focusAttention(['pattern-recognition', 'learning'], 70);

  // Show attention focus for each agent
  for (const agent of cognitiveAgents) {
    const attentionFocus = agent.getAttentionFocus();
    console.log(`${agent.name} attention focus:`);
    for (const { atom, attention } of attentionFocus.slice(0, 3)) {
      console.log(`  - ${atom.name || atom.type}: STI=${attention.sti}, LTI=${attention.lti}`);
    }
  }
  console.log();

  // Scenario 5: Learning from Experience
  console.log('📚 Scenario 5: Collective Learning');
  console.log('Agents learn from problem-solving experience...\n');

  // Simulate learning from successful problem solving
  await Promise.all([
    reasoningAgent.learn({
      concepts: ['logical-reasoning', 'inference'],
      outcome: 'positive',
      strength: 0.3,
    }),
    learningAgent.learn({
      concepts: ['reinforcement-learning', 'adaptation'],
      outcome: 'positive',
      strength: 0.4,
    }),
    patternAgent.learn({
      concepts: ['pattern-recognition', 'classification'],
      outcome: 'positive',
      strength: 0.35,
    }),
  ]);

  console.log('✅ Learning completed - agents updated their knowledge bases!\n');

  // Show cognitive statistics
  console.log('📊 Cognitive Statistics:');
  for (const agent of cognitiveAgents) {
    const stats = agent.getCognitiveStatistics();
    console.log(`${agent.name}:`);
    console.log(`  - Atoms: ${stats.atomCount}`);
    console.log(`  - Attention Focus: ${stats.attentionFocus}`);
    console.log(`  - Inferences: ${stats.inferenceCount}`);
    console.log(`  - Cognitive Load: ${(stats.cognitiveLoad * 100).toFixed(1)}%`);
  }
  console.log();
}

// Run mind agents cycle demonstration
async function demonstrateMindAgents() {
  console.log('🧠 Demonstrating Mind Agents Autonomous Processing...\n');
  
  // Run one cycle of mind agents
  const mindAgentResults = await cognitiveCoordinator.runMindAgentsCycle();
  
  console.log('🤖 Mind Agent Execution Results:');
  for (const result of mindAgentResults) {
    console.log(`${result.type}:`);
    console.log(`  - Success: ${result.success}`);
    console.log(`  - Actions: ${result.actionsPerformed.join(', ')}`);
    console.log(`  - Execution Time: ${result.executionTime}ms`);
  }
  console.log();

  // Show coordinator statistics
  const coordinatorStats = cognitiveCoordinator.getStatistics();
  console.log('📈 Cognitive Coordinator Statistics:');
  console.log(`  - Registered Agents: ${coordinatorStats.registeredAgents}`);
  console.log(`  - Mind Agents: ${coordinatorStats.mindAgents}`);
  console.log(`  - Active Requests: ${coordinatorStats.activeRequests}`);
  console.log(`  - Completed Requests: ${coordinatorStats.completedRequests}`);
  console.log();
}

// Main execution
async function main() {
  try {
    await seedKnowledge();
    await demonstrateDistributedCognition();
    await demonstrateMindAgents();

    console.log('🎉 OpenCog Distributed Agency demonstration completed successfully!\n');
    console.log('Key features demonstrated:');
    console.log('✅ Distributed cognitive processing across specialized agents');
    console.log('✅ Knowledge sharing and truth value propagation');
    console.log('✅ Attention allocation and focus management');
    console.log('✅ Consensus building and collective decision making');
    console.log('✅ Autonomous mind agents for cognitive maintenance');
    console.log('✅ Learning and adaptation from experience');
    console.log('✅ PLN-style probabilistic inference');
    console.log('✅ AtomSpace-like knowledge representation\n');

    console.log('🚀 Cognitive agents continue autonomous processing...');
    console.log('(In a real system, agents would continue running indefinitely)');

  } catch (error) {
    console.error('❌ Error during demonstration:', error);
  } finally {
    // Clean up autonomous processing
    for (const agent of cognitiveAgents) {
      agent.stopCognitiveProcessing();
    }
    console.log('\n🛑 Autonomous processing stopped.');
  }
}

// Start the demonstration
main().catch(console.error);