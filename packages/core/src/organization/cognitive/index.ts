/**
 * OpenCog-inspired cognitive architecture for distributed agency
 */

export { AtomSpace } from './atomspace';
export { CognitiveAgent, type CognitiveAgentConfig, type CognitiveStatistics } from './cognitive-agent';
export { AttentionBank } from './attention';
export { PLNReasoner } from './reasoning/pln';
export {
  MindAgent,
  AttentionAllocationAgent,
  PatternRecognitionAgent,
  GoalPursuitAgent,
  LearningAgent,
  MemoryConsolidationAgent,
  type MindAgentConfig,
  type MindAgentResult,
  type MindAgentType,
} from './mind-agent';
export {
  CognitiveCoordinator,
  type CognitiveCoordinatorConfig,
  type DistributedCognitiveRequest,
  type DistributedCognitiveResult,
} from './cognitive-coordinator';
export {
  type CognitiveContext,
  type CognitiveResult,
  type Atom,
  type AtomType,
  type TruthValue,
  type AttentionValue,
  type PLNInferenceRule,
  type InferenceResult,
} from './types';
export {
  HypergraphQueryEngine,
  type HypergraphPattern,
  type QueryResult,
  type QueryOperator,
  type TraversalQuery,
  type TraversalDirection,
  type PathQuery,
  type SubgraphQuery,
} from './hypergraph-query';
