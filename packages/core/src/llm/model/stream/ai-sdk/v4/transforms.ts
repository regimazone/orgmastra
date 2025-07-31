import { formatDataStreamPart } from 'ai';
import { DefaultGeneratedFileWithType } from './file';

export function convertFullStreamChunkToMastra(value: any, ctx: { runId: string }) {
  console.log('convert v4', value);
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
      type: 'tool-call-input-streaming-start',
      runId: ctx.runId,
      from: 'AGENT',
      payload: value,
    };
  } else if (value.type === 'text-delta') {
    console.log('text-delta SIJ', value);
    if (value.textDelta) {
      return {
        type: 'text-delta',
        runId: ctx.runId,
        from: 'AGENT',
        payload: {
          text: value.textDelta,
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
        totalUsage: {
          ...(value.usage ?? {}),
          totalTokens: value?.usage?.totalTokens ?? value.usage?.promptTokens + value.usage?.completionTokens,
        },
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
        stepResult: {
          reason: value.finishReason,
        },
        output: {
          usage: {
            ...(value.usage ?? {}),
            totalTokens: value?.usage?.totalTokens ?? value.usage?.promptTokens + value.usage?.completionTokens,
          },
        },
        metadata: {
          providerMetadata: value.providerMetadata,
        },
        messages: {
          all: [],
          user: [],
          nonUser: [],
        },
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
      type: 'reasoning-delta',
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

export function convertFullStreamChunkToAISDKv4({
  chunk,
  client,
  sendReasoning,
  sendSources,
  sendUsage = true,
  experimental_sendFinish = true,
  toolCallArgsDeltas,
  toolCallStreaming,
  getErrorMessage,
}: {
  chunk: any;
  client: boolean;
  sendReasoning: boolean;
  sendSources: boolean;
  sendUsage: boolean;
  experimental_sendFinish?: boolean;
  toolCallArgsDeltas?: Record<string, string[]>;
  toolCallStreaming?: boolean;
  getErrorMessage: (error: string) => string;
}) {
  console.log('convert v4', chunk, toolCallStreaming);
  if (chunk.type === 'text-delta') {
    if (client) {
      return formatDataStreamPart('text', chunk.payload.text);
    }
    return {
      type: 'text-delta',
      textDelta: chunk.payload.text,
    };
  } else if (chunk.type === 'step-start') {
    if (client) {
      return formatDataStreamPart('start_step', {
        messageId: chunk.payload.messageId,
      });
    }
    return {
      type: 'step-start',
      ...(chunk.payload || {}),
    };
  } else if (chunk.type === 'step-finish') {
    const { providerMetadata, request, ...otherMetadata } = chunk.payload.metadata;
    const transformedChunk = {
      type: 'step-finish',
      request,
      messageId: chunk.payload.messageId,
      experimental_providerMetadata: providerMetadata,
      finishReason: chunk.payload.stepResult.reason,
      logprobs: chunk.payload.stepResult.logprobs,
      providerMetadata: providerMetadata,
      response: otherMetadata,
      warnings: chunk.payload.stepResult.warnings,
      isContinued: chunk.payload.stepResult.isContinued,
      usage: {
        promptTokens: chunk.payload.output.usage.promptTokens ?? 0,
        completionTokens: chunk.payload.output.usage.completionTokens ?? 0,
        totalTokens:
          chunk.payload.output.usage.totalTokens ??
          chunk.payload.output.usage.promptTokens + chunk.payload.output.usage.completionTokens,
      },
    };

    if (client) {
      if (!chunk.payload) {
        return;
      }
      return formatDataStreamPart('finish_step', {
        finishReason: transformedChunk.finishReason,
        usage: sendUsage
          ? {
              promptTokens: chunk.payload.output.usage.promptTokens ?? 0,
              completionTokens: chunk.payload.output.usage.completionTokens ?? 0,
            }
          : undefined,
        isContinued: transformedChunk.isContinued,
      });
    }

    return transformedChunk;
  } else if (chunk.type === 'finish') {
    const { providerMetadata, request, ...otherMetadata } = chunk.payload.metadata;
    const transformedChunk = {
      type: 'finish',
      experimental_providerMetadata: providerMetadata,
      finishReason: chunk.payload.stepResult.reason,
      logprobs: chunk.payload.stepResult.logprobs,
      providerMetadata: providerMetadata,
      response: otherMetadata,
      usage: {
        promptTokens: chunk.payload.output.usage.promptTokens ?? 0,
        completionTokens: chunk.payload.output.usage.completionTokens ?? 0,
        totalTokens:
          chunk.payload.output.usage.totalTokens ??
          chunk.payload.output.usage.promptTokens + chunk.payload.output.usage.completionTokens,
      },
    };

    if (client) {
      if (experimental_sendFinish) {
        return formatDataStreamPart('finish_message', {
          finishReason: transformedChunk.finishReason,
          usage: sendUsage
            ? {
                promptTokens: chunk.payload.output.usage.promptTokens ?? 0,
                completionTokens: chunk.payload.output.usage.completionTokens ?? 0,
              }
            : undefined,
        });
      }
      return;
    }

    return transformedChunk;
  } else if (chunk.type === 'reasoning-delta') {
    if (client) {
      if (sendReasoning) {
        return formatDataStreamPart('reasoning', chunk.payload.text);
      }
      return;
    }
    return {
      type: 'reasoning',
      textDelta: chunk.payload.text,
    };
  } else if (chunk.type === 'reasoning-signature') {
    if (client) {
      if (sendReasoning) {
        return formatDataStreamPart('reasoning_signature', {
          signature: chunk.payload.signature,
        });
      }
      return;
    }
    return {
      type: 'reasoning-signature',
      signature: chunk.payload.signature,
    };
  } else if (chunk.type === 'redacted-reasoning') {
    if (client) {
      if (sendReasoning) {
        return formatDataStreamPart('redacted_reasoning', {
          data: chunk.payload.data,
        });
      }
      return;
    }
    return {
      type: 'redacted-reasoning',
      data: chunk.payload.data,
    };
  } else if (chunk.type === 'source') {
    if (client && sendSources) {
      return formatDataStreamPart('source', chunk.payload.source);
    }
    return {
      type: 'source',
      source: chunk.payload.source,
    };
  } else if (chunk.type === 'file') {
    if (client) {
      return formatDataStreamPart('file', {
        mimeType: chunk.payload.mimeType,
        data: chunk.payload.data,
      });
    }
    return new DefaultGeneratedFileWithType({
      data: chunk.payload.data,
      mimeType: chunk.payload.mimeType,
    });
  } else if (chunk.type === 'tool-call') {
    if (client) {
      let args;

      if (!chunk.payload.args) {
        args = toolCallArgsDeltas?.[chunk.payload.toolCallId]?.join('') ?? '';
      } else {
        args = chunk.payload.args;
      }

      return formatDataStreamPart('tool_call', {
        toolCallId: chunk.payload.toolCallId,
        toolName: chunk.payload.toolName,
        args: args,
      });
    }

    return {
      type: 'tool-call',
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
      args: chunk.payload.args,
    };
  } else if (chunk.type === 'tool-call-input-streaming-start' && toolCallStreaming) {
    console.log('tool-call-input-streaming-start', chunk);
    if (client) {
      return formatDataStreamPart('tool_call_streaming_start', {
        toolCallId: chunk.payload.toolCallId,
        toolName: chunk.payload.toolName,
      });
    }
    return {
      type: 'tool-call-streaming-start',
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
    };
  } else if (chunk.type === 'tool-call-delta' && toolCallStreaming) {
    if (client) {
      return formatDataStreamPart('tool_call_delta', {
        toolCallId: chunk.payload.toolCallId,
        argsTextDelta: chunk.payload.argsTextDelta,
      });
    }
    return {
      type: 'tool-call-delta',
      toolCallId: chunk.payload.toolCallId,
      argsTextDelta: chunk.payload.argsTextDelta,
      toolName: chunk.payload.toolName,
    };
  } else if (chunk.type === 'tool-result') {
    if (client) {
      return formatDataStreamPart('tool_result', {
        toolCallId: chunk.payload.toolCallId,
        result: chunk.payload.result,
      });
    }
    return {
      type: 'tool-result',
      args: chunk.payload.args,
      toolCallId: chunk.payload.toolCallId,
      toolName: chunk.payload.toolName,
      result: chunk.payload.result,
    };
  } else if (chunk.type === 'error') {
    if (client) {
      return formatDataStreamPart('error', getErrorMessage(chunk.payload.error));
    }
    return {
      type: 'error',
      error: chunk.payload.error,
    };
  } else {
    console.log('unknown chunk', chunk);
  }
}
