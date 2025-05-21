import type { HonoRequest } from 'hono';
import { MastraBase } from '../base';
import { InstrumentClass } from '../telemetry';
import type { MastraAuthConfig, ContextWithMastra } from './types';

export function defineAuth<TUser>(config: MastraAuthConfig<TUser>): MastraAuthConfig<TUser> {
  return config;
}

@InstrumentClass({
  prefix: 'auth',
  excludeMethods: ['__setTools', '__setLogger', '__setTelemetry', '#log'],
})
export abstract class MastraAuthProvider<TUser = unknown> extends MastraBase {
  constructor(options?: { name?: string }) {
    super({ component: 'AUTH', name: options?.name });
  }

  /**
   * Authenticate a token and return the payload
   * @param token - The token to authenticate
   * @param request - The request
   * @returns The payload
   */
  abstract authenticateToken(token: string, request: HonoRequest): Promise<TUser | null>;

  /**
   * Authorize a user for a path and method
   * @param path - The path to authorize
   * @param method - The method to authorize
   * @param user - The user to authorize
   * @param context - The context
   * @returns The authorization result
   */
  abstract authorize(path: string, method: string, user: TUser, context: ContextWithMastra): Promise<boolean>;
}
