# OpenCog Distributed Agency Cognitive Architecture

This implementation provides an OpenCog-inspired cognitive architecture for distributed agency using the Mastra framework. It extends the existing organizational structure and federated agency systems with cognitive capabilities.

## Architecture Overview

The cognitive architecture consists of several key components:

### Core Components

#### 1. AtomSpace (`atomspace.ts`)

- **Purpose**: Distributed knowledge representation system inspired by OpenCog's AtomSpace
- **Features**:
  - Atom creation and management with truth values
  - Type-based and name-based indexing
  - Pattern matching and querying
  - Attention value integration
  - Optional persistent storage and vector embedding

#### 2. AttentionBank (`attention.ts`)

- **Purpose**: Manages attention allocation across atoms using STI/LTI mechanisms
- **Features**:
  - Short-term Importance (STI) and Long-term Importance (LTI) allocation
  - Attention spreading along atom relationships
  - Dynamic attention decay and forgetting
  - Focus threshold management
  - Budget-constrained attention distribution

#### 3. PLNReasoner (`reasoning/pln.ts`)

- **Purpose**: Probabilistic Logic Networks for distributed inference
- **Features**:
  - Deduction, induction, and abduction rules
  - Modus ponens and modus tollens
  - Truth value revision and combination
  - Confidence-based inference filtering
  - Inference chain tracking

#### 4. CognitiveAgent (`cognitive-agent.ts`)

- **Purpose**: Integration of Person/Agent with cognitive capabilities
- **Features**:
  - Combines traditional agent capabilities with cognitive processing
  - Autonomous inference and learning
  - Knowledge querying and management
  - Attention focusing on concepts
  - Learning from experience with truth value updates

#### 5. MindAgents (`mind-agent.ts`)

- **Purpose**: Autonomous cognitive processes for system maintenance
- **Types**:
  - **AttentionAllocationAgent**: Redistributes attention dynamically
  - **PatternRecognitionAgent**: Identifies and abstracts patterns
  - **GoalPursuitAgent**: Pursues goals through adaptive planning
  - **LearningAgent**: Updates knowledge based on experience
  - **MemoryConsolidationAgent**: Consolidates important memories

#### 6. CognitiveCoordinator (`cognitive-coordinator.ts`)

- **Purpose**: Orchestrates distributed cognitive processes across agents
- **Features**:
  - Distributed inference coordination
  - Knowledge sharing with confidence filtering
  - Consensus building algorithms
  - Mind agent orchestration
  - Cognitive load balancing

## Key Features

### 1. Truth Value System

- **Strength**: Confidence in the truth of an atom [0, 1]
- **Confidence**: Reliability of the strength value [0, 1]
- **Count**: Evidence count supporting the truth value
- **Revision**: Automatic truth value merging when similar atoms are added

### 2. Attention Allocation

- **STI (Short-term Importance)**: Current relevance [-1000, 1000]
- **LTI (Long-term Importance)**: Long-term significance [-1000, 1000]
- **VLTI (Very Long-term Importance)**: Permanent importance [0, 1]
- **Dynamics**: Automatic spreading, decay, and budget management

### 3. Distributed Inference

- **Collaboration**: Multiple agents contribute to inference processes
- **Aggregation**: Results combined using confidence weighting
- **Specialization**: Different agents excel at different reasoning types
- **Scalability**: Inference workload distributed across the network

### 4. Knowledge Sharing

- **Selective Sharing**: Only high-confidence knowledge is shared
- **Confidence Reduction**: Shared knowledge has reduced confidence
- **Metadata Tracking**: Source tracking for shared atoms
- **Conflict Resolution**: Automatic merging of similar knowledge

### 5. Consensus Building

- **Weighted Voting**: Agent votes weighted by their knowledge confidence
- **Threshold-based**: Configurable consensus thresholds
- **Dissent Tracking**: Identification of dissenting agents
- **Explanation**: Reasoning behind consensus decisions

## Usage Examples

### Basic AtomSpace Operations

```typescript
import { AtomSpace } from '@mastra/core/organization';

const atomSpace = new AtomSpace({ name: 'my-atomspace' });

// Create concept atoms
const learning = await atomSpace.addAtom('concept', 'learning', [], { strength: 0.8, confidence: 0.7, count: 1 });

const intelligence = await atomSpace.addAtom('concept', 'intelligence', [], {
  strength: 0.9,
  confidence: 0.8,
  count: 1,
});

// Create relationships
const similarity = await atomSpace.addAtom('similarity', undefined, [learning.id, intelligence.id], {
  strength: 0.7,
  confidence: 0.6,
  count: 1,
});

// Query atoms
const concepts = atomSpace.getAtomsByType('concept');
const learningAtoms = atomSpace.getAtomsByName('learning');
```

### Attention Management

```typescript
import { AttentionBank } from '@mastra/core/organization';

const attentionBank = new AttentionBank({
  name: 'attention-system',
  totalSTI: 10000,
  totalLTI: 10000,
  focusThreshold: 100,
  forgettingThreshold: -50,
  maxAttentionAtoms: 50,
  decayRate: 0.01,
  spreadingRate: 0.1,
});

// Allocate attention to important concepts
attentionBank.allocateAttention(learning.id, 150, 75);

// Get focused atoms
const focusedAtoms = attentionBank.getFocusedAtoms();

// Spread attention to related concepts
attentionBank.spreadAttention(learning.id, [intelligence.id], 0.2);
```

### Probabilistic Inference

```typescript
import { PLNReasoner } from '@mastra/core/organization';

const reasoner = new PLNReasoner({
  name: 'logic-reasoner',
  maxInferenceDepth: 3,
  minConfidenceThreshold: 0.3,
  maxInferencesPerStep: 10,
  enableProbabilisticLogic: true,
});

const atoms = [learning, intelligence, similarity];
const inferences = await reasoner.performInference(atoms);

// Apply specific rules
const deductionResults = await reasoner.applyDeduction(atoms);
const inductionResults = await reasoner.applyInduction(atoms);
```

### Cognitive Agent Creation

```typescript
import { CognitiveAgent } from '@mastra/core/organization';
import { openai } from '@ai-sdk/openai';

const cognitiveAgent = new CognitiveAgent({
  id: 'reasoning-specialist',
  name: 'Aristotle',
  description: 'Expert in logical reasoning and inference',
  position: {
    organizationId: 'cognitive-collective',
    roleId: 'reasoning-specialist',
  },
  skills: ['logical-reasoning', 'inference', 'pattern-analysis'],
  cognitiveCapabilities: ['deductive-reasoning', 'inductive-reasoning', 'modus-ponens'],
  agentConfig: {
    instructions: 'You are a reasoning specialist...',
    model: openai('gpt-4'),
  },
  autonomousProcessing: true,
  processingInterval: 30000,
});

// Add knowledge
await cognitiveAgent.addKnowledge('concept', 'logical-reasoning', ['inference', 'deduction'], 0.9);

// Perform inference
const result = await cognitiveAgent.performInference(['reasoning']);

// Focus attention
cognitiveAgent.focusAttention(['logical-reasoning'], 80);

// Learn from experience
await cognitiveAgent.learn({
  concepts: ['logical-reasoning'],
  outcome: 'positive',
  strength: 0.3,
});
```

### Distributed Coordination

```typescript
import { CognitiveCoordinator } from '@mastra/core/organization';

const coordinator = new CognitiveCoordinator(mastra.pubsub, {
  name: 'cognitive-coordinator',
  maxConcurrentProcesses: 10,
  coordinationTimeout: 30000,
  enableDistributedInference: true,
  knowledgeShareThreshold: 0.6,
  consensusThreshold: 0.7,
});

// Register agents
coordinator.registerAgent(reasoningAgent);
coordinator.registerAgent(learningAgent);

// Distributed inference
const distributedResult = await coordinator.performDistributedInference('How can we improve learning efficiency?', [
  'reasoning-specialist',
  'learning-specialist',
]);

// Knowledge sharing
const sharingResult = await coordinator.shareKnowledge('reasoning-specialist', ['learning-specialist'], {
  minConfidence: 0.7,
});

// Consensus building
const consensusResult = await coordinator.buildConsensus(
  'What should be the priority focus?',
  ['reasoning-specialist', 'learning-specialist'],
  ['attention-mechanisms', 'knowledge-representation', 'learning-algorithms'],
);
```

## Integration with Mastra Framework

The cognitive architecture integrates seamlessly with Mastra's existing systems:

- **Organizational Structure**: Cognitive agents extend the Person class
- **Federation**: Cognitive coordination uses existing pubsub and delegation systems
- **Memory**: AtomSpace can use Mastra's storage and vector systems
- **Tools**: Cognitive agents have access to all Mastra tools and workflows
- **Telemetry**: All cognitive operations are instrumented for monitoring

## Testing

Comprehensive unit tests verify the functionality of all components:

```bash
# Run cognitive architecture tests
pnpm --filter @mastra/core test src/organization/cognitive/cognitive.test.ts
```

Tests cover:

- AtomSpace atom creation and querying
- AttentionBank attention allocation and management
- PLNReasoner inference rule application
- Truth value revision and combination
- Distributed coordination protocols

## Performance Considerations

- **Memory Management**: Attention-based forgetting prevents unbounded growth
- **Distributed Load**: Inference distributed across multiple agents
- **Caching**: Efficient indexing for fast atom retrieval
- **Budgeting**: Attention budgets prevent resource exhaustion
- **Batching**: Mind agents run in configurable intervals

## Future Extensions

Potential areas for enhancement:

1. **MOSES Integration**: Evolutionary learning and program synthesis
2. **Temporal Reasoning**: Time-aware inference and planning
3. **Emotional Processing**: Affect-based attention modulation
4. **Sensory Integration**: Multi-modal perception and processing
5. **Natural Language**: Integration with language understanding
6. **Goal Systems**: Hierarchical goal management and pursuit
7. **Creativity**: Divergent thinking and novel concept generation

## References

- [OpenCog Framework](https://opencog.org/)
- [Probabilistic Logic Networks](https://wiki.opencog.org/w/PLN)
- [AtomSpace Design](https://wiki.opencog.org/w/AtomSpace)
- [Attention Allocation](https://wiki.opencog.org/w/Attention_allocation)
- [Mastra Framework](https://mastra.ai/)
