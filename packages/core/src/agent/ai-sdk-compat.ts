/**
 * AI SDK Compatibility Detection Utilities
 * 
 * Determines whether to use v4 or v5 compatibility mode based on:
 * - Mastra configuration
 * - Client request headers
 * - Query parameters
 */

import type { AiSdkCompatMode } from '../mastra';

/**
 * Type for request-like objects that can provide headers and query parameters
 * Covers Hono requests, Web API Request objects, and plain objects
 */
export type RequestLike = {
  // Hono request methods
  header?(): Record<string, string>;
  query?: (() => Record<string, string>) | Record<string, string>;
  // Web API Request object or plain object headers
  headers?: {
    get(name: string): string | null;
  } | Record<string, string>;
  // URL-based query parsing
  url?: string;
};

export interface CompatibilityContext {
  /** Mastra instance compatibility configuration */
  compatMode: AiSdkCompatMode;
  /** Request headers (case-insensitive) */
  headers?: Record<string, string>;
  /** Query parameters */
  query?: Record<string, string>;
}

/**
 * Determine if v4 compatibility mode should be used
 * @param context - The compatibility detection context
 * @returns true if v4 compatibility should be used, false for v5 native
 */
export function shouldUseV4Compatibility(context: CompatibilityContext): boolean {
  const { compatMode, headers = {}, query = {} } = context;

  // Direct v4/v5 mode override
  if (compatMode === 'v4') {
    return true;
  }
  if (compatMode === 'v5') {
    return false;
  }

  // Auto-detection mode
  if (compatMode === 'auto') {
    // Check query parameter first (takes precedence)
    const queryAiSdk = query.aisdk || query.aiSdk || query['ai-sdk'];
    if (queryAiSdk === 'v4') {
      return true;
    }
    if (queryAiSdk === 'v5') {
      return false;
    }

    // Check headers (case-insensitive)
    const headerKeys = Object.keys(headers);
    
    // Check X-AI-SDK-Version header
    const aiSdkVersionKey = headerKeys.find(key => 
      key.toLowerCase() === 'x-ai-sdk-version'
    );
    if (aiSdkVersionKey) {
      const version = headers[aiSdkVersionKey];
      if (version === 'v4' || version === '4') {
        return true;
      }
      if (version === 'v5' || version === '5') {
        return false;
      }
    }

    // Check X-Mastra-AI-SDK-Compat header
    const compatHeaderKey = headerKeys.find(key => 
      key.toLowerCase() === 'x-mastra-ai-sdk-compat'
    );
    if (compatHeaderKey) {
      const compat = headers[compatHeaderKey];
      if (compat === 'v4') {
        return true;
      }
      if (compat === 'v5') {
        return false;
      }
    }

    // Default to v5 when in auto mode and no explicit indicators found
    return false;
  }

  // Fallback to v5 (should not reach here with proper typing)
  return false;
}

/**
 * Extract headers from common request objects
 * @param request - Request-like object with headers
 * @returns normalized headers object
 */
export function extractHeaders(request?: RequestLike): Record<string, string> {
  if (!request) return {};

  // Handle Hono request objects (c.req)
  if (typeof request.header === 'function') {
    return request.header();
  }

  // Handle different request object types
  if (request.headers) {
    // Web API Request object or similar
    if (typeof request.headers.get === 'function') {
      const headers: Record<string, string> = {};
      // Common headers to check
      const commonHeaders = [
        'x-ai-sdk-version',
        'x-mastra-ai-sdk-compat',
        'user-agent',
        'accept',
        'content-type'
      ];
      
      for (const header of commonHeaders) {
        const value = request.headers.get(header);
        if (value) {
          headers[header] = value;
        }
      }
      return headers;
    }

    // Plain object headers
    if (typeof request.headers === 'object' && !('get' in request.headers)) {
      return { ...request.headers as Record<string, string> };
    }
  }

  return {};
}

/**
 * Extract query parameters from common request objects
 * @param request - Request-like object with query/searchParams
 * @returns normalized query parameters object
 */
export function extractQuery(request?: RequestLike): Record<string, string> {
  if (!request) return {};

  // Handle Hono request objects (c.req)
  if (request.query && typeof request.query === 'function') {
    return request.query();
  }

  // Handle URL with searchParams
  if (request.url) {
    try {
      const url = new URL(request.url);
      const query: Record<string, string> = {};
      for (const [key, value] of url.searchParams.entries()) {
        query[key] = value;
      }
      return query;
    } catch {
      // Invalid URL, continue to other methods
    }
  }

  // Handle direct query object
  if (request.query && typeof request.query === 'object') {
    return { ...request.query as Record<string, string> };
  }

  return {};
}

/**
 * Convenience function to determine compatibility from a request object
 * @param compatMode - Mastra compatibility configuration
 * @param request - Request-like object
 * @returns true if v4 compatibility should be used
 */
export function shouldUseV4CompatibilityFromRequest(
  compatMode: AiSdkCompatMode, 
  request?: RequestLike
): boolean {
  return shouldUseV4Compatibility({
    compatMode,
    headers: extractHeaders(request),
    query: extractQuery(request),
  });
}