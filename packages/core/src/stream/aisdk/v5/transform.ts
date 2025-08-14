import type {
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider-v5';
import type { TextStreamPart, ToolSet } from 'ai-v5';

type TextStreamPartPayload<T extends TextStreamPart<ToolSet>['type']> = Omit<
  Extract<TextStreamPart<ToolSet>, { type: T }>,
  'type'
>;
type LanguageModelV2StreamPartPayload<T extends LanguageModelV2StreamPart['type']> = Omit<
  Extract<LanguageModelV2StreamPart, { type: T }>,
  'type'
>;
type StreamPartType = TextStreamPart<ToolSet>['type'] | LanguageModelV2StreamPart['type'];
type StreamPartPayload<T extends StreamPartType> = T extends LanguageModelV2StreamPart['type']
  ? LanguageModelV2StreamPartPayload<T>
  : T extends TextStreamPart<ToolSet>['type']
    ? TextStreamPartPayload<T>
    : never;

type ChunkType<T extends string, P = Record<string, any>> = {
  type: T;
  runId: string;
  from: 'AGENT';
  payload: P;
};

type MastraFinishStreamPart = {
  type: 'finish';
  stepResult: {
    reason: LanguageModelV2FinishReason;
  };
  output: {
    usage: LanguageModelV2Usage;
  };
  metadata: {
    providerMetadata: SharedV2ProviderMetadata;
  };
  messages: {
    all: any[];
    user: any[];
    nonUser: any[];
  };
};

export type MastraStreamChunk =
  | ChunkType<'text-start', StreamPartPayload<'text-start'>>
  | ChunkType<
      'text-delta',
      Omit<StreamPartPayload<'text-delta'>, 'delta'> & {
        /**
         * AI SDK v5 uses 'delta' in LanguageModelV2StreamPart (provider interface) but it renames to 'text' in TextStreamPart (consumer API)
         * Mastra standardizes on 'text' internally for consistency across all interfaces
         */
        text: string;
      }
    >
  | ChunkType<'start', {}>
  | ChunkType<
      'step-start',
      StreamPartPayload<'start-step'> & {
        /**
         * Mastra adds messageId to all step-start chunks
         */
        messageId?: string;
      }
    >
  | ChunkType<'raw', unknown>
  | ChunkType<'response-metadata', StreamPartPayload<'response-metadata'>>
  | ChunkType<'text-end', StreamPartPayload<'text-end'>>
  | ChunkType<'reasoning-start', StreamPartPayload<'reasoning-start'>>
  | ChunkType<
      'reasoning-delta',
      Omit<StreamPartPayload<'reasoning-delta'>, 'delta'> & {
        /**
         * AI SDK v5 uses 'delta' in LanguageModelV2StreamPart (provider interface) but it renames to 'text' in TextStreamPart (consumer API)
         * Mastra standardizes on 'text' internally for consistency across all interfaces
         */
        text: string;
      }
    >
  | ChunkType<'reasoning-end', StreamPartPayload<'reasoning-end'>>
  | ChunkType<
      'source',
      // StreamPartPayload<'source'>
      // TODO: are we sticking with mimeType over mediaType?
      {
        id: string;
        sourceType: 'document' | 'url';
        title?: string;
        mimeType?: string;
        filename?: string;
        url?: string;
        providerMetadata?: SharedV2ProviderMetadata;
      }
    >
  | ChunkType<
      'file',
      {
        data?: string | Uint8Array<ArrayBufferLike>;
        base64?: string;
        mimeType?: string;
        providerMetadata?: SharedV2ProviderMetadata;
      }
    >
  | ChunkType<
      'tool-call',
      Omit<StreamPartPayload<'tool-call'>, 'input'> & {
        args: unknown;
      }
    >
  | ChunkType<'tool-result', StreamPartPayload<'tool-result'>>
  | ChunkType<
      'tool-call-input-streaming-start',
      Omit<StreamPartPayload<'tool-input-start'>, 'id'> & {
        toolCallId: string;
      }
    >
  | ChunkType<
      'tool-call-delta',
      {
        toolCallId: string; // from 'id'
        argsTextDelta: string; // from 'delta
        providerMetadata?: SharedV2ProviderMetadata;
      }
    >
  | ChunkType<
      'tool-call-input-streaming-end',
      {
        toolCallId: string; // from 'id'
        providerMetadata?: SharedV2ProviderMetadata;
      }
    >
  | ChunkType<'tool-error', StreamPartPayload<'tool-error'>>
  | ChunkType<'finish', MastraFinishStreamPart>
  | ChunkType<'step-finish', StreamPartPayload<'finish-step'>>
  | ChunkType<'abort', {}>
  | ChunkType<'error', StreamPartPayload<'error'>>;

type StreamPart =
  | Exclude<LanguageModelV2StreamPart, { type: 'finish' }>
  | {
      type: 'finish';
      finishReason: LanguageModelV2FinishReason;
      usage: LanguageModelV2Usage;
      providerMetadata: SharedV2ProviderMetadata;
      messages: {
        all: any[];
        user: any[];
        nonUser: any[];
      };
    };

export function convertFullStreamChunkToMastra(
  value: StreamPart,
  ctx: { runId: string },
): MastraStreamChunk | undefined {
  switch (value.type) {
    case 'response-metadata':
      return {
        type: 'response-metadata',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          modelId: value.modelId ?? 'unknown',
          timestamp: value.timestamp,
          id: value.id,
        },
      };
    case 'text-start':
      return {
        type: 'text-start',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          id: value.id,
          providerMetadata: value.providerMetadata,
        },
      };
    case 'text-delta':
      if (value.delta) {
        return {
          type: 'text-delta',
          runId: ctx.runId,
          from: 'AGENT',
          payload: {
            id: value.id,
            providerMetadata: value.providerMetadata,
            text: value.delta,
          },
        };
      }
      return;

    case 'text-end':
      return {
        type: 'text-end',
        runId: ctx.runId,
        from: 'AGENT',
        payload: value,
      };

    case 'reasoning-start':
      return {
        type: 'reasoning-start',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          id: value.id,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'reasoning-delta':
      if (value.delta) {
        return {
          type: 'reasoning-delta',
          runId: ctx.runId,
          from: 'AGENT',
          payload: {
            id: value.id,
            providerMetadata: value.providerMetadata,
            text: value.delta,
          },
        };
      }
      return;

    case 'reasoning-end':
      return {
        type: 'reasoning-end',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          id: value.id,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'source':
      return {
        type: 'source',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          id: value.id,
          sourceType: value.sourceType,
          title: value.title,
          // TODO: are we sticking with mimeType over mediaType?
          mimeType: value.sourceType === 'document' ? value.mediaType : undefined,
          filename: value.sourceType === 'document' ? value.filename : undefined,
          url: value.sourceType === 'url' ? value.url : undefined,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'file':
      return {
        type: 'file',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          data: value.data,
          base64: typeof value.data === 'string' ? value.data : undefined,
          mimeType: value.mediaType,
        },
      };

    case 'tool-call':
      return {
        type: 'tool-call',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          toolCallId: value.toolCallId,
          toolName: value.toolName,
          args: value.input ? JSON.parse(value.input) : undefined,
          providerExecuted: value.providerExecuted,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'tool-result':
      return {
        type: 'tool-result',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          toolCallId: value.toolCallId,
          toolName: value.toolName,
          result: value.result,
          isError: value.isError,
          providerExecuted: value.providerExecuted,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'tool-input-start':
      return {
        type: 'tool-call-input-streaming-start',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          toolCallId: value.id,
          toolName: value.toolName,
          providerExecuted: value.providerExecuted,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'tool-input-delta':
      if (value.delta) {
        return {
          type: 'tool-call-delta',
          runId: ctx.runId,
          from: 'AGENT',
          payload: {
            argsTextDelta: value.delta,
            toolCallId: value.id,
            providerMetadata: value.providerMetadata,
          },
        };
      }
      return;

    case 'tool-input-end':
      return {
        type: 'tool-call-input-streaming-end',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          toolCallId: value.id,
          providerMetadata: value.providerMetadata,
        },
      };

    case 'finish':
      const { finishReason, usage, providerMetadata, messages, ...rest } = value;
      return {
        type: 'finish',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          stepResult: {
            reason: value.finishReason,
          },
          output: {
            usage: {
              ...(value.usage ?? {}),
              totalTokens:
                value?.usage?.totalTokens ?? (value.usage?.inputTokens ?? 0) + (value.usage?.outputTokens ?? 0),
            },
          },
          metadata: {
            providerMetadata: value.providerMetadata,
          },
          messages,
          ...rest,
        },
      };
  }
  return;
  // if (value.type === 'step-start') {
  //     return {
  //         type: 'step-start',
  //         runId: ctx.runId,
  //         from: 'AGENT',
  //         payload: {
  //             messageId: value.messageId,
  //             request: { body: JSON.parse(value.request!.body ?? '{}') },
  //             warnings: value.warnings,
  //         },
  //     };
  // } else if (value.type === 'tool-error') {
  //     return {
  //         type: 'tool-error',
  //         runId: ctx.runId,
  //         from: 'AGENT',
  //         payload: {
  //             id: value.id,
  //             providerMetadata: value.providerMetadata,
  //             toolCallId: value.toolCallId,
  //             toolName: value.toolName,
  //             args: value.args,
  //             error: value.error,
  //         },
  //     };
  // } else if (value.type === 'step-finish') {
  //     return {
  //         type: 'step-finish',
  //         runId: ctx.runId,
  //         from: 'AGENT',
  //         payload: {
  //             id: value.id,
  //             providerMetadata: value.providerMetadata,
  //             reason: value.finishReason,
  //             totalUsage: value.usage,
  //             response: value.response,
  //             messageId: value.messageId,
  //         },
  //     };
  // else if (value.type === 'reasoning-signature') {
  //     return {
  //         type: 'reasoning-signature',
  //         runId: ctx.runId,
  //         from: 'AGENT',
  //         payload: {
  //             id: value.id,
  //             signature: value.signature,
  //             providerMetadata: value.providerMetadata,
  //         },
  //     };
  // } else if (value.type === 'redacted-reasoning') {
  //     return {
  //         type: 'redacted-reasoning',
  //         runId: ctx.runId,
  //         from: 'AGENT',
  //         payload: {
  //             id: value.id,
  //             data: value.data,
  //             providerMetadata: value.providerMetadata,
  //         },
  //     };
  //  else if (value.type === 'error') {
  //     return {
  //         type: 'error',
  //         runId: ctx.runId,
  //         from: 'AGENT',
  //         payload: {
  //             id: value.id,
  //             providerMetadata: value.providerMetadata,
  //             error: value.error,
  //         },
  //     };
  // }
}

type OutputChunkType = TextStreamPart<ToolSet> | undefined;

export function convertMastraChunkToAISDKv5({
  chunk,
  includeRawChunks,
}: {
  chunk: MastraStreamChunk;
  includeRawChunks?: boolean;
}): OutputChunkType {
  switch (chunk.type) {
    case 'start':
      return {
        type: 'start',
      };
    case 'step-start':
      const { messageId: _messageId, ...rest } = chunk.payload;

      return {
        type: 'start-step',
        request: rest.request,
        warnings: rest.warnings,
      };
    case 'raw':
      if (includeRawChunks) {
        return {
          type: 'raw',
          rawValue: chunk.payload,
        };
      }
      return;

    case 'finish': {
      return {
        type: 'finish',
        finishReason: chunk.payload.stepResult.reason,
        totalUsage: chunk.payload.output.usage,
      };
    }
    case 'reasoning-start':
      return {
        type: 'reasoning-start',
        id: chunk.payload.id,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'reasoning-delta':
      return {
        type: 'reasoning-delta',
        id: chunk.payload.id,
        text: chunk.payload.text,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'reasoning-end':
      return {
        type: 'reasoning-end' as const,
        id: chunk.payload.id,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'source':
      if (chunk.payload.sourceType === 'url') {
        return {
          type: 'source',
          sourceType: 'url',
          id: chunk.payload.id,
          url: chunk.payload.url!,
          title: chunk.payload.title,
          providerMetadata: chunk.payload.providerMetadata,
        };
      } else {
        return {
          type: 'source',
          sourceType: 'document',
          id: chunk.payload.id,
          // TODO: Are we sicking with mimeType in Mastra stream chunks?
          mediaType: chunk.payload.mimeType || '',
          title: chunk.payload.title || '',
          filename: chunk.payload.filename,
          providerMetadata: chunk.payload.providerMetadata,
        };
      }
    // TODO: add DefaultGeneratedFile
    // case 'file':
    //   return {
    //     type: 'file',
    //     file: {
    //       base64: chunk.payload.base64,
    //       uint8Array: chunk.payload.uint8Array,
    //       mediaType: chunk.payload.mediaType,
    //     },
    //   };
    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: chunk.payload.toolCallId,
        providerMetadata: chunk.payload.providerMetadata,
        providerExecuted: chunk.payload.providerExecuted,
        toolName: chunk.payload.toolName,
        input: chunk.payload.args,
      };
    case 'tool-call-input-streaming-start':
      return {
        type: 'tool-input-start',
        id: chunk.payload.toolCallId,
        toolName: chunk.payload.toolName,
        dynamic: chunk.payload.dynamic,
        providerMetadata: chunk.payload.providerMetadata,
        providerExecuted: chunk.payload.providerExecuted,
      };
    case 'tool-call-input-streaming-end':
      return {
        type: 'tool-input-end',
        id: chunk.payload.toolCallId,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'tool-call-delta':
      return {
        type: 'tool-input-delta',
        id: chunk.payload.toolCallId,
        delta: chunk.payload.argsTextDelta,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'step-finish': {
      const reason = chunk.payload.stepResult.reason;
      return {
        type: 'finish-step',
        response: chunk.payload.response,
        usage: chunk.payload.output.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: (reason === 'continue' || reason === 'abort' ? 'other' : reason) as LanguageModelV2FinishReason,
        providerMetadata: chunk.payload.providerMetadata,
      };
    }
    case 'text-delta':
      return {
        type: 'text-delta',
        id: chunk.payload.id,
        text: chunk.payload.text,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'text-end':
      return {
        type: 'text-end',
        id: chunk.payload.id,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'text-start':
      return {
        type: 'text-start',
        id: chunk.payload.id,
        providerMetadata: chunk.payload.providerMetadata,
      };
    case 'tool-result':
      return {
        type: 'tool-result',
        input: chunk.payload.args,
        toolCallId: chunk.payload.toolCallId,
        providerExecuted: chunk.payload.providerExecuted,
        toolName: chunk.payload.toolName,
        output: chunk.payload.result,
        // providerMetadata: chunk.payload.providerMetadata, // AI v5 types don't show this?
      };
    case 'tool-error':
      return {
        type: 'tool-error',
        error: chunk.payload.error,
        input: chunk.payload.args,
        toolCallId: chunk.payload.toolCallId,
        providerExecuted: chunk.payload.providerExecuted,
        toolName: chunk.payload.toolName,
        // providerMetadata: chunk.payload.providerMetadata, // AI v5 types don't show this?
      };

    case 'abort':
      return {
        type: 'abort',
      };

    case 'error':
      return {
        type: 'error',
        error: chunk.payload.error,
      };
  }

  return;
}
