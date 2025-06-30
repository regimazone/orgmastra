/**
 * Type definitions for LongMemEval benchmark data structures
 * Based on the official LongMemEval dataset format
 */

export type QuestionType = 
  | 'single-session-user'
  | 'single-session-assistant'
  | 'single-session-preference'
  | 'temporal-reasoning'
  | 'knowledge-update'
  | 'multi-session';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  has_answer?: boolean; // True for turns containing required evidence
}

export interface LongMemEvalQuestion {
  question_id: string;
  question_type: QuestionType;
  question: string;
  answer: string;
  question_date: string;
  haystack_session_ids: string[];
  haystack_dates: string[];
  haystack_sessions: Turn[][]; // Array of sessions, each session is array of turns
  answer_session_ids: string[]; // Session IDs containing evidence
}

export interface EvaluationResult {
  question_id: string;
  hypothesis: string;
  autoeval_label?: boolean;
  question_type?: QuestionType;
  is_correct?: boolean;
}

export interface BenchmarkConfig {
  dataset: 'longmemeval_s' | 'longmemeval_m' | 'longmemeval_oracle';
  model: string;
  memoryConfig: MemoryConfigType;
  outputDir?: string;
  subset?: number;
}

export type MemoryConfigType = 
  | 'full-history'
  | 'last-k'
  | 'semantic-recall'
  | 'working-memory'
  | 'combined';

export interface MemoryConfigOptions {
  type: MemoryConfigType;
  lastK?: number;
  semanticRecallTopK?: number;
  semanticRecallMessageRange?: number | { before: number; after: number };
  workingMemoryTemplate?: string;
}

export interface BenchmarkMetrics {
  overall_accuracy: number;
  accuracy_by_type: Record<QuestionType, number>;
  abstention_accuracy: number;
  session_recall_accuracy?: number;
  turn_recall_accuracy?: number;
  total_questions: number;
  correct_answers: number;
}