import { describe, expect, it } from 'vitest';
import { 
  shouldUseV4Compatibility, 
  shouldUseV4CompatibilityFromRequest,
  extractHeaders,
  extractQuery,
  type RequestLike,
  type CompatibilityContext 
} from './ai-sdk-compat';

describe('AI SDK Compatibility Detection', () => {
  describe('shouldUseV4Compatibility', () => {
    it('should return true for v4 mode', () => {
      const context: CompatibilityContext = {
        compatMode: 'v4',
        headers: {},
        query: {},
      };
      expect(shouldUseV4Compatibility(context)).toBe(true);
    });

    it('should return false for v5 mode', () => {
      const context: CompatibilityContext = {
        compatMode: 'v5',
        headers: {},
        query: {},
      };
      expect(shouldUseV4Compatibility(context)).toBe(false);
    });

    it('should detect v4 from X-AI-SDK-Version header', () => {
      const context: CompatibilityContext = {
        compatMode: 'auto',
        headers: { 'x-ai-sdk-version': 'v4' },
        query: {},
      };
      expect(shouldUseV4Compatibility(context)).toBe(true);
    });

    it('should detect v5 from X-AI-SDK-Version header', () => {
      const context: CompatibilityContext = {
        compatMode: 'auto',
        headers: { 'x-ai-sdk-version': 'v5' },
        query: {},
      };
      expect(shouldUseV4Compatibility(context)).toBe(false);
    });

    it('should detect v4 from query parameter', () => {
      const context: CompatibilityContext = {
        compatMode: 'auto',
        headers: {},
        query: { aisdk: 'v4' },
      };
      expect(shouldUseV4Compatibility(context)).toBe(true);
    });

    it('should prioritize query over headers', () => {
      const context: CompatibilityContext = {
        compatMode: 'auto',
        headers: { 'x-ai-sdk-version': 'v5' },
        query: { aisdk: 'v4' },
      };
      expect(shouldUseV4Compatibility(context)).toBe(true);
    });
  });

  describe('extractHeaders', () => {
    it('should extract headers from Hono request', () => {
      const request: RequestLike = {
        header: () => ({ 'x-ai-sdk-version': 'v4', 'content-type': 'application/json' }),
      };
      const headers = extractHeaders(request);
      expect(headers).toEqual({
        'x-ai-sdk-version': 'v4',
        'content-type': 'application/json',
      });
    });

    it('should extract headers from Web API Request', () => {
      const request: RequestLike = {
        headers: {
          get: (name: string) => name === 'x-ai-sdk-version' ? 'v4' : null,
        },
      };
      const headers = extractHeaders(request);
      expect(headers['x-ai-sdk-version']).toBe('v4');
    });

    it('should extract headers from plain object', () => {
      const request: RequestLike = {
        headers: { 'x-ai-sdk-version': 'v4' },
      };
      const headers = extractHeaders(request);
      expect(headers).toEqual({ 'x-ai-sdk-version': 'v4' });
    });

    it('should return empty object for null request', () => {
      const headers = extractHeaders({});
      expect(headers).toEqual({});
    });
  });

  describe('extractQuery', () => {
    it('should extract query from Hono request', () => {
      const request: RequestLike = {
        query: () => ({ aisdk: 'v4', limit: '10' }),
      };
      const query = extractQuery(request);
      expect(query).toEqual({ aisdk: 'v4', limit: '10' });
    });

    it('should extract query from URL', () => {
      const request: RequestLike = {
        url: 'https://example.com/api/test?aisdk=v4&limit=10',
      };
      const query = extractQuery(request);
      expect(query).toEqual({ aisdk: 'v4', limit: '10' });
    });

    it('should extract query from plain object', () => {
      const request: RequestLike = {
        query: { aisdk: 'v4' },
      };
      const query = extractQuery(request);
      expect(query).toEqual({ aisdk: 'v4' });
    });

    it('should return empty object for null request', () => {
      const query = extractQuery({});
      expect(query).toEqual({});
    });
  });

  describe('shouldUseV4CompatibilityFromRequest', () => {
    it('should work with Hono request objects', () => {
      const request: RequestLike = {
        header: () => ({ 'x-ai-sdk-version': 'v4' }),
        query: () => ({}),
      };
      expect(shouldUseV4CompatibilityFromRequest('auto', request)).toBe(true);
    });

    it('should work with Web API Request objects', () => {
      const request: RequestLike = {
        headers: {
          get: (name: string) => name === 'x-ai-sdk-version' ? 'v4' : null,
        },
        url: 'https://example.com/api/test',
      };
      expect(shouldUseV4CompatibilityFromRequest('auto', request)).toBe(true);
    });

    it('should work with plain request objects', () => {
      const request: RequestLike = {
        headers: { 'x-ai-sdk-version': 'v4' },
        query: {},
      };
      expect(shouldUseV4CompatibilityFromRequest('auto', request)).toBe(true);
    });
  });
});