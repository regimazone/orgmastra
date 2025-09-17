// Constants and Types (keeping from original implementation)
export const RegisteredLogger = {
  AGENT: 'AGENT',
  AI_TRACING: 'AI_TRACING',
  AUTH: 'AUTH',
  NETWORK: 'NETWORK',
  WORKFLOW: 'WORKFLOW',
  LLM: 'LLM',
  TTS: 'TTS',
  VOICE: 'VOICE',
  VECTOR: 'VECTOR',
  BUNDLER: 'BUNDLER',
  DEPLOYER: 'DEPLOYER',
  MEMORY: 'MEMORY',
  STORAGE: 'STORAGE',
  EMBEDDINGS: 'EMBEDDINGS',
  MCP_SERVER: 'MCP_SERVER',
  // Cognitive architecture components
  ATOMSPACE: 'ATOMSPACE',
  ATTENTION: 'ATTENTION',
  PLN_REASONER: 'PLN_REASONER',
  MIND_AGENT: 'MIND_AGENT',
  COGNITIVE_COORDINATOR: 'COGNITIVE_COORDINATOR',
} as const;

export type RegisteredLogger = (typeof RegisteredLogger)[keyof typeof RegisteredLogger];

export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  NONE: 'silent',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
