/**
 * AI SDK v5 to v4 Stream Transformer
 * Converts v5 UIMessageStream format to v4 DataStream format for backwards compatibility
 */

// V5 Stream Part Types (from AI SDK v5)
export type UIMessageStreamPart =
  | { type: 'text'; text: string }
  | { type: 'error'; errorText: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown }
  | { type: 'reasoning'; text: string; providerMetadata?: object }
  | { type: 'reasoning-part-finish' }
  | { type: 'start'; messageId?: string; messageMetadata?: unknown }
  | { type: 'finish'; messageMetadata?: unknown }
  | { type: 'start-step' }
  | { type: 'finish-step' };

// V4 Stream Prefixes (from AI SDK v4)
const DataStreamStringPrefixes = {
  text: '0',
  data: '2',
  error: '3',
  message_annotations: '8',
  tool_call: '9',
  tool_result: 'a',
  tool_call_streaming_start: 'b',
  tool_call_delta: 'c',
  finish_message: 'd',
  finish_step: 'e',
  start_step: 'f',
  reasoning: 'g',
  source: 'h',
  redacted_reasoning: 'i',
  reasoning_signature: 'j',
  file: 'k',
} as const;

/**
 * Parse Server-Sent Events stream into individual JSON objects
 */
export function parseSSEStream(): TransformStream<Uint8Array, UIMessageStreamPart> {
  const decoder = new TextDecoder();
  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          // Check for stream end marker
          if (data === '[DONE]') {
            return;
          }

          try {
            const parsed = JSON.parse(data) as UIMessageStreamPart;
            controller.enqueue(parsed);
          } catch (error) {
            console.warn('Failed to parse SSE data:', data, error);
          }
        }
      }
    },

    flush(controller) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data) as UIMessageStreamPart;
            controller.enqueue(parsed);
          } catch (error) {
            console.warn('Failed to parse final SSE data:', data, error);
          }
        }
      }
    },
  });
}

/**
 * Transform v5 UIMessageStreamPart to v4 DataStream format
 */
export function transformV5ToV4Part(part: UIMessageStreamPart): string | null {
  switch (part.type) {
    case 'text':
      return `${DataStreamStringPrefixes.text}:${JSON.stringify(part.text)}\n`;

    case 'error':
      return `${DataStreamStringPrefixes.error}:${JSON.stringify(part.errorText)}\n`;

    case 'tool-input-available':
      return `${DataStreamStringPrefixes.tool_call}:${JSON.stringify({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.input,
      })}\n`;

    case 'tool-output-available':
      return `${DataStreamStringPrefixes.tool_result}:${JSON.stringify({
        toolCallId: part.toolCallId,
        result: part.output,
      })}\n`;

    case 'reasoning':
      return `${DataStreamStringPrefixes.reasoning}:${JSON.stringify(part.text)}\n`;

    case 'start':
      return `${DataStreamStringPrefixes.start_step}:${JSON.stringify({
        messageId: part.messageId,
        metadata: part.messageMetadata,
      })}\n`;

    case 'finish':
      return `${DataStreamStringPrefixes.finish_message}:${JSON.stringify({
        metadata: part.messageMetadata,
      })}\n`;

    case 'start-step':
      // V4 start_step expects: f:{messageId:string}
      // Since V5 doesn't provide messageId in start-step, we'll use a generated one
      return `${DataStreamStringPrefixes.start_step}:${JSON.stringify({ messageId: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` })}\n`;

    case 'finish-step':
      // V4 finish_step expects: e:{finishReason, usage, isContinued}
      // Since V5 doesn't provide this data in finish-step, we'll use defaults
      return `${DataStreamStringPrefixes.finish_step}:${JSON.stringify({
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0 },
        isContinued: false,
      })}\n`;

    case 'reasoning-part-finish':
      return null;

    case 'tool-input-start':
      return `${DataStreamStringPrefixes.tool_call_streaming_start}:${JSON.stringify({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      })}\n`;

    case 'tool-input-delta':
      return `${DataStreamStringPrefixes.tool_call_delta}:${JSON.stringify({
        toolCallId: part.toolCallId,
        delta: part.inputTextDelta,
      })}\n`;

    default:
      console.warn('Unknown v5 stream part type:', (part as any).type);
      return null;
  }
}

/**
 * Create a TransformStream that converts v5 parts to v4 format
 */
export function createV5ToV4Transformer(): TransformStream<UIMessageStreamPart, string> {
  return new TransformStream({
    transform(part, controller) {
      const v4Part = transformV5ToV4Part(part);
      if (v4Part) {
        controller.enqueue(v4Part);
      }
    },
  });
}

/**
 * Main function to transform a v5 stream to v4 format
 */
export function transformV5StreamToV4(v5Stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return v5Stream
    .pipeThrough(parseSSEStream())
    .pipeThrough(createV5ToV4Transformer())
    .pipeThrough(new TextEncoderStream());
}

/**
 * Response helper for Next.js API routes
 */
export function createV4CompatibleResponse(v5Stream: ReadableStream<Uint8Array>): Response {
  const v4Stream = transformV5StreamToV4(v5Stream);

  return new Response(v4Stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Express/Node.js helper - pipes Web API Response to Express response
 */
export async function pipeV4ResponseToExpress(v4Response: Response, expressRes: any): Promise<void> {
  // Set headers
  v4Response.headers.forEach((value, key) => {
    expressRes.setHeader(key, value);
  });

  // Set status
  expressRes.status(v4Response.status);

  // Pipe the stream
  if (!v4Response.body) {
    expressRes.end();
    return;
  }

  const reader = v4Response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      expressRes.write(value);
    }
    expressRes.end();
  } catch (error) {
    console.error('Stream error:', error);
    expressRes.status(500).end();
  }
}

/**
 * One-liner for Express: Transform v5 stream and pipe to Express response
 */
export async function streamV5ToV4Express(v5Stream: ReadableStream<Uint8Array>, expressRes: any): Promise<void> {
  const v4Response = createV4CompatibleResponse(v5Stream);
  await pipeV4ResponseToExpress(v4Response, expressRes);
}
