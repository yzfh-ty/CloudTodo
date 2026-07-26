import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { parseCookies } from '../http/cookie.util';

export interface SecurityRequestContext {
  ipAddress: string | null;
  requestId: string;
  sessionId: string | null;
}

type RequestLike = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  url?: string;
  path?: string;
};

const USER_SESSION_COOKIE_NAME = 'cloudtodo_user_session';
const ADMIN_SESSION_COOKIE_NAME = 'cloudtodo_admin_session';

/**
 * Carries request identity into services that deliberately do not accept an
 * Express request object (for example, audit events emitted by a repository).
 * Only a hash of a session credential is retained; the credential itself is
 * never written to the audit table.
 */
@Injectable()
export class SecurityRequestContextService {
  private readonly storage = new AsyncLocalStorage<SecurityRequestContext>();

  run<T>(
    request: RequestLike,
    callback: (context: SecurityRequestContext) => T,
  ): T {
    const context = this.createContext(request);
    return this.storage.run(context, () => callback(context));
  }

  current(): SecurityRequestContext | undefined {
    return this.storage.getStore();
  }

  private createContext(request: RequestLike): SecurityRequestContext {
    const headers = request.headers ?? {};
    const requestIdHeader = this.firstHeader(headers, 'x-request-id');
    const requestId = requestIdHeader && /^[A-Za-z0-9._:-]{1,128}$/.test(requestIdHeader)
      ? requestIdHeader
      : randomUUID();
    const remoteAddress = request.ip ?? request.socket?.remoteAddress ?? null;

    const cookies = parseCookies(this.firstHeader(headers, 'cookie'));
    const sessionToken = this.isAdminRequest(request)
      ? cookies[ADMIN_SESSION_COOKIE_NAME]
      : cookies[USER_SESSION_COOKIE_NAME];

    return {
      ipAddress: remoteAddress ? remoteAddress.slice(0, 64) : null,
      requestId,
      sessionId: sessionToken ? this.hashSessionToken(sessionToken) : null,
    };
  }

  private firstHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' ? first.trim() : undefined;
  }

  private hashSessionToken(token: string) {
    return createHash('sha256').update(token).digest('hex').slice(0, 64);
  }

  private isAdminRequest(request: RequestLike) {
    const requestUrl = request.originalUrl ?? request.url ?? request.path ?? '';
    const path = requestUrl.split('?', 1)[0].toLowerCase();
    return /^(?:\/api)?\/admin(?:\/|$)/.test(path);
  }
}
