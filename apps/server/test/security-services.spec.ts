import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { CsrfService } from '../src/common/security/csrf.service';
import { RateLimitService } from '../src/common/security/rate-limit.service';
import { SecurityAuditService } from '../src/common/security/security-audit.service';
import { SecurityRequestContextService } from '../src/common/security/security-request-context.service';

describe('security request context', () => {
  it('propagates bounded request identity without retaining a session credential', async () => {
    const service = new SecurityRequestContextService();
    const token = 'signed-session-token';

    await service.run(
      {
        ip: '203.0.113.10',
        headers: {
          cookie: `cloudtodo_user_session=${token}`,
          'x-request-id': 'request-123',
        },
      },
      async (context) => {
        await Promise.resolve();
        expect(service.current()).toEqual(context);
        expect(context).toEqual({
          ipAddress: '203.0.113.10',
          requestId: 'request-123',
          sessionId: createHash('sha256').update(token).digest('hex'),
        });
        expect(JSON.stringify(context)).not.toContain(token);
      },
    );

    expect(service.current()).toBeUndefined();
  });

  it('automatically enriches and sanitizes an audit event', async () => {
    const requestContext = new SecurityRequestContextService();
    const create = jest.fn().mockResolvedValue({});
    const upsert = jest.fn().mockResolvedValue({});
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      securityAuditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
      securityAuditChainHead: { upsert },
    };
    const audit = new SecurityAuditService(
      {
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      } as never,
      requestContext,
    );

    await requestContext.run(
      {
        ip: '198.51.100.8',
        headers: {
          cookie: 'cloudtodo_user_session=session-secret',
          'x-request-id': 'audit-42',
        },
      },
      () =>
        audit.record({
          action: 'user_login_success',
          result: 'success',
          metadata: { refreshToken: 'must-not-be-stored' },
        }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: '198.51.100.8',
        requestId: 'audit-42',
        sessionId: createHash('sha256').update('session-secret').digest('hex'),
        metadata: { refreshToken: '[REDACTED]' },
        prevHash: '0'.repeat(64),
        chainIndex: 1n,
        entryHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    // record() swallows write failures on purpose, so the head write has to be
    // asserted explicitly: otherwise a broken chain write still looks green.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ chainIndex: 1n }),
      }),
    );
  });
});

describe('CSRF public request boundary', () => {
  const service = new CsrfService(
    new ConfigService({
      CSRF_SECRET: 'test-csrf-secret',
      APP_BASE_URL: 'https://todo.example.net',
      CORS_ORIGINS: 'https://todo.example.net',
    }),
  );

  it('allows native clients without browser origin metadata', () => {
    expect(() =>
      service.assertTrustedOriginForPublicRequest({ headers: {} }),
    ).not.toThrow();
  });

  it('rejects browser requests that suppress Origin and Referer', () => {
    expect(() =>
      service.assertTrustedOriginForPublicRequest({
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
    ).toThrow(ForbiddenException);
  });

  it('accepts only configured browser origins', () => {
    expect(() =>
      service.assertTrustedOriginForPublicRequest({
        headers: { origin: 'https://todo.example.net' },
      }),
    ).not.toThrow();
    expect(() =>
      service.assertTrustedOriginForPublicRequest({
        headers: { origin: 'https://attacker.example.net' },
      }),
    ).toThrow(ForbiddenException);
  });
});

describe('rate-limit client identity', () => {
  const service = new RateLimitService(
    new ConfigService({ TRUSTED_PROXY_IPS: '10.0.0.10' }),
  );

  it('uses Express resolved IP behind an explicit trusted proxy', () => {
    expect(
      service.clientKey({
        ip: '203.0.113.25',
        socket: { remoteAddress: '10.0.0.10' },
        headers: { 'x-forwarded-for': '192.0.2.99, 203.0.113.25' },
      }),
    ).toBe('203.0.113.25');
  });

  it('ignores resolved/forwarded values from an untrusted peer', () => {
    expect(
      service.clientKey({
        ip: '192.0.2.99',
        socket: { remoteAddress: '198.51.100.9' },
        headers: { 'x-forwarded-for': '203.0.113.25' },
      }),
    ).toBe('198.51.100.9');
  });

  it('does not evict live protected buckets when attacker keys fill capacity', () => {
    const bounded = new RateLimitService(
      new ConfigService({ RATE_LIMIT_MAX_BUCKETS: '100' }),
    );

    for (let index = 0; index < 100; index += 1) {
      bounded.assertAllowed(`attacker-key-${index}`, 1, 60_000);
    }

    expect(() => bounded.assertAllowed('attacker-key-100', 1, 60_000)).toThrow();
    // The first bucket remains exhausted; a churned key did not reset it.
    expect(() => bounded.assertAllowed('attacker-key-0', 1, 60_000)).toThrow();
  });
});
