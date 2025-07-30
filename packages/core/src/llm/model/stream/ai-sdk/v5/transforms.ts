import { formatDataStreamPart } from 'ai';
import { DefaultGeneratedFileWithType } from '../v4/file';

export function convertFullStreamChunkToMastra(value: any, ctx: { runId: string }) {
  if (value.type === 'step-start') {
    return {
      type: 'step-start',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        messageId: value.messageId,
        request: { body: JSON.parse(value.request!.body ?? '{}') },
        warnings: value.warnings,
      },
    };
  } else if (value.type === 'tool-call') {
    return {
      type: 'tool-call',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        toolCallId: value.toolCallId,
        args: value.args ? JSON.parse(value.args) : undefined,
        toolName: value.toolName,
      },
    };
  } else if (value.type === 'tool-result') {
    return {
      type: 'tool-result',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: value.args,
        result: value.result,
      },
    };
  } else if (value.type === 'tool-call-delta') {
    console.log('tool-call-delta', value);
    return {
      type: 'tool-call-delta',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        argsTextDelta: value.argsTextDelta,
        toolCallId: value.toolCallId,
        toolName: value.toolName,
      },
    };
  } else if (value.type === 'tool-call-streaming-start') {
    return {
      type: 'tool-call-streaming-start',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value,
    };
  } else if (value.type === 'text-start') {
    return {
      type: 'text-start',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value,
    };
  } else if (value.type === 'text-end') {
    return {
      type: 'text-end',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value,
    };
  } else if (value.type === 'text-delta') {
    if (value.delta) {
      return {
        type: 'text-delta',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          text: value.delta,
        },
      };
    }
  } else if (value.type === 'step-finish') {
    return {
      type: 'step-finish',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        reason: value.finishReason,
        totalUsage: value.usage,
        response: value.response,
        messageId: value.messageId,
        providerMetadata: value.providerMetadata,
      },
    };
  } else if (value.type === 'finish') {
    const { finishReason, usage, providerMetadata, messages: _messages, ...rest } = value;
    return {
      type: 'finish',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        reason: value.finishReason,
        totalUsage: value.usage,
        providerMetadata: value.providerMetadata,
        ...rest,
      },
    };
  } else if (value.type === 'response-metadata') {
    return {
      type: 'response-metadata',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value,
    };
  } else if (value.type === 'reasoning') {
    return {
      type: 'reasoning',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        text: value.textDelta,
      },
    };
  } else if (value.type === 'reasoning-signature') {
    return {
      type: 'reasoning-signature',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        signature: value.signature,
      },
    };
  } else if (value.type === 'redacted-reasoning') {
    return {
      type: 'redacted-reasoning',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        data: value.data,
      },
    };
  } else if (value.type === 'source') {
    return {
      type: 'source',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        source: value.source,
      },
    };
  } else if (value.type === 'file') {
    return {
      type: 'file',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        data: value.data,
        base64: value.base64,
        mimeType: value.mimeType,
      },
    };
  } else if (value.type === 'error') {
    console.log('error to MASTRA', value);
    return {
      type: 'error',
      runId: ctx.runId,
      from: 'AGENT',
      payload: {
        error: value.error,
      },
    };
  }
}

export function convertFullStreamChunkToAISDKv5({
  chunk,
  sendReasoning,
  sendSources,
  sendUsage = true,
  experimental_sendFinish = true,
  toolCallArgsDeltas,
  toolCallStreaming,
  getErrorMessage,
}: {
  chunk: any;
  sendReasoning: boolean;
  sendSources: boolean;
  sendUsage: boolean;
  experimental_sendFinish?: boolean;
  toolCallArgsDeltas?: Record<string, string[]>;
  toolCallStreaming?: boolean;
  getErrorMessage: (error: string) => string;
}) {
  if (chunk.type === 'text-delta') {
    return {
      type: 'text-delta',
      text: chunk.payload.text,
      providerMetadata: undefined,
    };
  } else if (chunk.type === 'text-start') {
    return {
      type: 'text-start',
    };
  } else if (chunk.type === 'text-end') {
    return {
      type: 'text-end',
    };
  } else if (chunk.type === 'step-start') {
    const { messageId: _messageId, ...rest } = chunk.payload;
    return {
      type: 'start-step',
      ...(rest || {}),
    };
  } else if (chunk.type === 'step-finish') {
    const { totalUsage, reason, response } = chunk.payload;
    return {
      usage: {
        promptTokens: totalUsage.promptTokens,
        completionTokens: totalUsage.completionTokens,
        totalTokens: totalUsage.totalTokens || totalUsage.promptTokens + totalUsage.completionTokens,
      },
      response: response,
      providerMetadata: undefined,
      finishReason: reason,
      type: 'finish-step',
    };
  } else if (chunk.type === 'start') {
    return {
      type: 'start',
    };
  } else if (chunk.type === 'finish') {
    const { totalUsage, reason, messages: _messages } = chunk.payload;

    return {
      type: 'finish',
      finishReason: reason,
      usage: totalUsage,
    };
  } else if (chunk.type === 'reasoning') {
    return {
      type: 'reasoning',
      textDelta: chunk.payload.text,
    };
  } else if (chunk.type === 'reasoning-signature') {
    return {
      type: 'reasoning-signature',
      signature: chunk.payload.signature,
    };
  } else if (chunk.type === 'redacted-reasoning') {
    return {
      type: 'redacted-reasoning',
      data: chunk.payload.data,
    };
  } else if (chunk.type === 'source') {
    return {
      type: 'source',
      source: chunk.payload.source,
    };
  } else if (chunk.type === 'file') {
    return new DefaultGeneratedFileWithType({
      data: chunk.payload.data,
      mimeType: chunk.payload.mimeType,
    });
  } else if (chunk.type === 'tool-call') {
    return {
      type: 'tool-call',
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
      args: chunk.payload.args,
    };
  } else if (chunk.type === 'tool-call-streaming-start' && toolCallStreaming) {
    console.log('tool-call-streaming-start SUHHHHH', chunk.payload);
    return {
      type: 'tool-call-streaming-start',
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
    };
  } else if (chunk.type === 'tool-call-delta' && toolCallStreaming) {
    return {
      type: 'tool-call-delta',
      toolCallId: chunk.payload.toolCallId,
      argsTextDelta: chunk.payload.argsTextDelta,
      toolName: chunk.payload.toolName,
    };
  } else if (chunk.type === 'tool-result') {
    return {
      type: 'tool-result',
      args: chunk.payload.args,
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
      result: chunk.payload.result,
    };
  } else if (chunk.type === 'error') {
    return {
      type: 'error',
      error: chunk.payload.error,
    };
  } else {
    console.log('unknown chunk', chunk);
  }
}
