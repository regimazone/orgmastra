/**
 * OpenCog-inspired cognitive architecture for distributed agency
 */

export { AtomSpace, type Atom, type AtomType, type TruthValue } from './atomspace';
export { CognitiveAgent, type CognitiveAgentConfig, type CognitiveStatistics } from './cognitive-agent';
export { AttentionBank, type AttentionValue } from './attention';
export { PLNReasoner, type PLNInferenceRule, type InferenceResult } from './reasoning/pln';
export { 
  MindAgent, 
  AttentionAllocationAgent,
  PatternRecognitionAgent,
  GoalPursuitAgent,
  LearningAgent,
  MemoryConsolidationAgent,
  type MindAgentConfig,
  type MindAgentResult,
  type MindAgentType 
} from './mind-agent';
export { 
  CognitiveCoordinator, 
  type CognitiveCoordinatorConfig,
  type DistributedCognitiveRequest,
  type DistributedCognitiveResult 
} from './cognitive-coordinator';
export { type CognitiveContext, type CognitiveResult } from './types';