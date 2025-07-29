import { describe, expect, it } from 'vitest';
import { AISDKV5OutputStream, convertFullStreamChunkToAISDKv5, getErrorMessageV5 } from './v5';
import { MastraModelOutput } from '../base';
import { simulateChunkStream } from '../test-utils';

describe('AI SDK v5 Transforms', () => {
  describe('convertFullStreamChunkToAISDKv5', () => {
    it('should convert text-delta chunks to v5 format', () => {
      const chunk = {
        type: 'text-delta',
        payload: { text: 'Hello world' }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toEqual({
        type: 'text-delta',
        delta: { content: 'Hello world' }
      });
    });

    it('should convert text-delta chunks to SSE format for client', () => {
      const chunk = {
        type: 'text-delta',
        payload: { text: 'Hello' }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: true,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toBe('data: {"type":"text-delta","delta":{"content":"Hello"}}\n\n');
    });

    it('should convert reasoning-delta chunks when sendReasoning is true', () => {
      const chunk = {
        type: 'reasoning-delta',
        payload: { reasoning: 'I need to think about this...' }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: true,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toEqual({
        type: 'reasoning-delta',
        delta: { reasoning: 'I need to think about this...' }
      });
    });

    it('should ignore reasoning-delta chunks when sendReasoning is false', () => {
      const chunk = {
        type: 'reasoning-delta',
        payload: { reasoning: 'Hidden reasoning' }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toBeNull();
    });

    it('should convert source chunks when sendSources is true', () => {
      const chunk = {
        type: 'source',
        payload: {
          type: 'source',
          sourceType: 'url',
          id: 'source-1',
          url: 'https://example.com',
          title: 'Example'
        }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: true,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toEqual({
        type: 'source',
        source: {
          type: 'source',
          sourceType: 'url',
          id: 'source-1',
          url: 'https://example.com',
          title: 'Example'
        }
      });
    });

    it('should convert tool-call chunks with proper structure', () => {
      const chunk = {
        type: 'tool-call',
        payload: {
          toolCallId: 'call-123',
          toolName: 'weather',
          args: { city: 'New York' }
        }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toEqual({
        type: 'tool-call',
        toolCallId: 'call-123',
        toolName: 'weather',
        args: { city: 'New York' }
      });
    });

    it('should convert tool-result chunks', () => {
      const chunk = {
        type: 'tool-result',
        payload: {
          toolCallId: 'call-123',
          result: { temperature: 72, conditions: 'sunny' }
        }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toEqual({
        type: 'tool-result',
        toolCallId: 'call-123',
        result: { temperature: 72, conditions: 'sunny' }
      });
    });

    it('should convert finish chunks with usage data', () => {
      const chunk = {
        type: 'finish',
        payload: {
          finishReason: 'stop',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30
          }
        }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => String(err)
      });

      expect(result).toEqual({
        type: 'finish',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      });
    });

    it('should convert error chunks', () => {
      const chunk = {
        type: 'error',
        payload: { error: 'Something went wrong' }
      };

      const result = convertFullStreamChunkToAISDKv5({
        chunk,
        client: false,
        sendReasoning: false,
        sendSources: false,
        sendUsage: true,
        getErrorMessage: (err) => `Error: ${err}`
      });

      expect(result).toEqual({
        type: 'error',
        error: 'Error: Something went wrong'
      });
    });
  });

  describe('getErrorMessageV5', () => {
    it('should format error messages properly', () => {
      const error = 'Network timeout';
      const result = getErrorMessageV5(error);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle object errors', () => {
      const error = { message: 'Database error', code: 500 };
      const result = getErrorMessageV5(error);
      expect(typeof result).toBe('string');
    });
  });

  describe('AISDKV5OutputStream', () => {
    it('should create SSE response with correct headers', () => {
      const mockStream = simulateChunkStream([
        { type: 'text-delta', payload: { text: 'Hello' } },
        { type: 'finish', payload: { finishReason: 'stop' } }
      ]);

      const modelOutput = new MastraModelOutput({ 
        stream: mockStream, 
        options: { toolCallStreaming: false } 
      });

      const outputStream = new AISDKV5OutputStream({
        modelOutput,
        options: { toolCallStreaming: false }
      });

      const response = outputStream.toUIMessageStreamResponse();

      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toBe('no-cache');
      expect(response.headers.get('connection')).toBe('keep-alive');
    });

    it('should support text stream response for backwards compatibility', () => {
      const mockStream = simulateChunkStream([
        { type: 'text-delta', payload: { text: 'Hello world' } }
      ]);

      const modelOutput = new MastraModelOutput({ 
        stream: mockStream, 
        options: {} 
      });

      const outputStream = new AISDKV5OutputStream({
        modelOutput,
        options: {}
      });

      const response = outputStream.toTextStreamResponse();

      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    });
  });
});