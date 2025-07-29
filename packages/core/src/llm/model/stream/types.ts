import type { IDGenerator, LanguageModelV1, LanguageModelV1Prompt, streamText, ToolChoice, ToolSet } from 'ai';
import type { MastraLogger } from '../../../logger';
import type { ChunkType } from '../../../stream/types';

export type OnResult = (result: { warnings: any; request: any; rawResponse: any }) => void;

export type CreateStream = () =>
  | Promise<{
      stream: ReadableStream<any>;
      warnings: any;
      request: any;
      rawResponse: any;
    }>
  | ReadableStream<any>;

export type StreamInternal = {
  now?: () => number;
  generateId?: IDGenerator;
  currentDate?: () => Date;
};

export type ExecutionProps = {
  model: LanguageModelV1;
  inputMessages: LanguageModelV1Prompt;
  runId: string;
  providerMetadata?: Record<string, any>;
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet> | undefined;
  activeTools?: Array<keyof ToolSet> | undefined;
  _internal?: StreamInternal;
  toolCallStreaming?: boolean;
  options?: {
    onChunk: (chunk: ChunkType) => void;
  };
  logger?: MastraLogger;
};

export type AgentWorkflowProps = {
  messageId: string;
  controller: ReadableStreamDefaultController<ChunkType>;
} & ExecutionProps;

export type StreamExecutorProps = {
  maxSteps?: number;
  maxRetries?: number;
  experimental_generateMessageId?: Pick<
    Parameters<typeof streamText>[0],
    'experimental_generateMessageId'
  >['experimental_generateMessageId'];
} & ExecutionProps;
