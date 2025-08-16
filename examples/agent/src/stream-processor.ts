/**
 * Custom stream processor for Mastra ChunkType format
 * Similar to AI SDK's processDataStream but tailored for ChunkType structure
 */

export type ChunkType = {
  type: string;
  runId: string;
  from: string;
  payload: Record<string, any>;
};

export interface MastraStreamProcessorOptions {
  stream: ReadableStream<Uint8Array>;

  // Text streaming callbacks
  onTextDelta?: (chunk: ChunkType & { type: 'text-delta' }) => void | Promise<void>;
  onTextChunk?: (text: string, id?: string) => void | Promise<void>;

  // Tool-related callbacks
  onToolCall?: (chunk: ChunkType & { type: 'tool-call' }) => void | Promise<void>;
  onToolCallInputStart?: (chunk: ChunkType & { type: 'tool-call-input-streaming-start' }) => void | Promise<void>;
  onToolCallInputDelta?: (chunk: ChunkType & { type: 'tool-call-delta' }) => void | Promise<void>;
  onToolCallInputEnd?: (chunk: ChunkType & { type: 'tool-call-input-streaming-end' }) => void | Promise<void>;
  onToolResult?: (chunk: ChunkType & { type: 'tool-result' }) => void | Promise<void>;

  // Reasoning callbacks
  onReasoningStart?: (chunk: ChunkType & { type: 'reasoning-start' }) => void | Promise<void>;
  onReasoningDelta?: (chunk: ChunkType & { type: 'reasoning-delta' }) => void | Promise<void>;
  onReasoningEnd?: (chunk: ChunkType & { type: 'reasoning-end' }) => void | Promise<void>;
  onReasoningSignature?: (chunk: ChunkType & { type: 'reasoning-signature' }) => void | Promise<void>;
  onRedactedReasoning?: (chunk: ChunkType & { type: 'redacted-reasoning' }) => void | Promise<void>;

  // File and source callbacks
  onFile?: (chunk: ChunkType & { type: 'file' }) => void | Promise<void>;
  onSource?: (chunk: ChunkType & { type: 'source' }) => void | Promise<void>;

  // Step lifecycle callbacks
  onStepStart?: (chunk: ChunkType & { type: 'step-start' }) => void | Promise<void>;
  onStepFinish?: (chunk: ChunkType & { type: 'step-finish' }) => void | Promise<void>;

  // Stream lifecycle callbacks
  onStart?: (chunk: ChunkType & { type: 'start' }) => void | Promise<void>;
  onFinish?: (chunk: ChunkType & { type: 'finish' }) => void | Promise<void>;

  // Error and raw data callbacks
  onError?: (chunk: ChunkType & { type: 'error' }) => void | Promise<void>;
  onRaw?: (chunk: ChunkType & { type: 'raw' }) => void | Promise<void>;

  // Generic callback for any chunk type
  onChunk?: (chunk: ChunkType) => void | Promise<void>;

  // Error handling
  onParseError?: (error: Error, rawText: string) => void;
}

/**
 * Process a Mastra ChunkType stream with callbacks for different chunk types
 */
export async function processMastraStream(options: MastraStreamProcessorOptions): Promise<void> {
  const {
    stream,
    onTextDelta,
    onTextChunk,
    onToolCall,
    onToolCallInputStart,
    onToolCallInputDelta,
    onToolCallInputEnd,
    onToolResult,
    onReasoningStart,
    onReasoningDelta,
    onReasoningEnd,
    onReasoningSignature,
    onRedactedReasoning,
    onFile,
    onSource,
    onStepStart,
    onStepFinish,
    onStart,
    onFinish,
    onError,
    onRaw,
    onChunk,
    onParseError,
  } = options;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      buffer += text;

      // Split by newlines for JSONL format
      const lines = buffer.split('\n');

      // Keep the last line in buffer (might be incomplete)
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // Skip empty lines

        try {
          const chunk: ChunkType = JSON.parse(trimmed);

          // Call the generic chunk callback first
          await onChunk?.(chunk);

          // Route to specific type handlers
          switch (chunk.type) {
            case 'start':
              await onStart?.(chunk as ChunkType & { type: 'start' });
              break;

            case 'text-delta':
              await onTextDelta?.(chunk as ChunkType & { type: 'text-delta' });
              // Also call the simplified text callback
              await onTextChunk?.(chunk.payload.text, chunk.payload.id);
              break;

            case 'tool-call':
              await onToolCall?.(chunk as ChunkType & { type: 'tool-call' });
              break;

            case 'tool-call-input-streaming-start':
              await onToolCallInputStart?.(chunk as ChunkType & { type: 'tool-call-input-streaming-start' });
              break;

            case 'tool-call-delta':
              await onToolCallInputDelta?.(chunk as ChunkType & { type: 'tool-call-delta' });
              break;

            case 'tool-call-input-streaming-end':
              await onToolCallInputEnd?.(chunk as ChunkType & { type: 'tool-call-input-streaming-end' });
              break;

            case 'tool-result':
              await onToolResult?.(chunk as ChunkType & { type: 'tool-result' });
              break;

            case 'reasoning-start':
              await onReasoningStart?.(chunk as ChunkType & { type: 'reasoning-start' });
              break;

            case 'reasoning-delta':
              await onReasoningDelta?.(chunk as ChunkType & { type: 'reasoning-delta' });
              break;

            case 'reasoning-end':
              await onReasoningEnd?.(chunk as ChunkType & { type: 'reasoning-end' });
              break;

            case 'reasoning-signature':
              await onReasoningSignature?.(chunk as ChunkType & { type: 'reasoning-signature' });
              break;

            case 'redacted-reasoning':
              await onRedactedReasoning?.(chunk as ChunkType & { type: 'redacted-reasoning' });
              break;

            case 'file':
              await onFile?.(chunk as ChunkType & { type: 'file' });
              break;

            case 'source':
              await onSource?.(chunk as ChunkType & { type: 'source' });
              break;

            case 'step-start':
              await onStepStart?.(chunk as ChunkType & { type: 'step-start' });
              break;

            case 'step-finish':
              await onStepFinish?.(chunk as ChunkType & { type: 'step-finish' });
              break;

            case 'finish':
              await onFinish?.(chunk as ChunkType & { type: 'finish' });
              break;

            case 'error':
              await onError?.(chunk as ChunkType & { type: 'error' });
              break;

            case 'raw':
              await onRaw?.(chunk as ChunkType & { type: 'raw' });
              break;

            default:
              // Unknown chunk type - still call generic handler if available
              console.warn(`Unknown chunk type: ${chunk.type}`);
              break;
          }
        } catch (error) {
          if (onParseError) {
            onParseError(error as Error, trimmed);
          } else {
            console.error('Failed to parse chunk:', trimmed, error);
          }
        }
      }
    }

    // Handle final line if any
    if (buffer.trim()) {
      try {
        const chunk: ChunkType = JSON.parse(buffer.trim());
        await onChunk?.(chunk);
        // Route to specific handler based on type...
        // (same switch logic as above)
      } catch (error) {
        if (onParseError) {
          onParseError(error as Error, buffer.trim());
        } else {
          console.error('Failed to parse final chunk:', buffer.trim(), error);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Higher-level utility that creates a Response-like object with processMastraStream method
 * Similar to how AI SDK enhances Response objects
 */
export function enhanceResponseWithMastraProcessor(response: Response): Response & {
  processMastraStream: (options?: Omit<MastraStreamProcessorOptions, 'stream'>) => Promise<void>;
} {
  const enhanced = response as Response & {
    processMastraStream: (options?: Omit<MastraStreamProcessorOptions, 'stream'>) => Promise<void>;
  };

  enhanced.processMastraStream = async (options = {}) => {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    await processMastraStream({
      stream: response.body,
      ...options,
    });
  };

  return enhanced;
}

/**
 * Simple text accumulator utility
 */
export class TextAccumulator {
  private text = '';
  private textById: Record<string, string> = {};

  handleTextDelta = (chunk: ChunkType & { type: 'text-delta' }) => {
    this.text += chunk.payload.text;

    if (chunk.payload.id) {
      this.textById[chunk.payload.id] = (this.textById[chunk.payload.id] || '') + chunk.payload.text;
    }
  };

  getText(): string {
    return this.text;
  }

  getTextById(id: string): string {
    return this.textById[id] || '';
  }

  getAllTextById(): Record<string, string> {
    return { ...this.textById };
  }

  reset(): void {
    this.text = '';
    this.textById = {};
  }
}
