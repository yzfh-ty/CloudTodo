import { createHash } from 'node:crypto';
import { SecurityRequestContextService } from '../src/common/security/security-request-context.service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('security request context session identity', () => {
  it('ignores an untrusted Authorization bearer value', () => {
    const service = new SecurityRequestContextService();

    service.run(
      {
        headers: {
          authorization: 'Bearer attacker-controlled-token',
          cookie: 'cloudtodo_user_session=authenticated-user-session',
        },
        originalUrl: '/api/todos',
      },
      (context) => {
        expect(context.sessionId).toBe(hash('authenticated-user-session'));
        expect(context.sessionId).not.toBe(hash('attacker-controlled-token'));
      },
    );
  });

  it('does not derive a session identity from a bearer value alone', () => {
    const service = new SecurityRequestContextService();

    service.run(
      {
        headers: { authorization: 'Bearer attacker-controlled-token' },
        originalUrl: '/api/todos',
      },
      (context) => {
        expect(context.sessionId).toBeNull();
      },
    );
  });

  it.each(['/api/admin/users', '/admin', '/admin/login'])(
    'uses the admin session cookie for an admin request at %s',
    (originalUrl) => {
      const service = new SecurityRequestContextService();

      service.run(
        {
          headers: {
            cookie: [
              'cloudtodo_user_session=user-session',
              'cloudtodo_admin_session=admin-session',
            ].join('; '),
          },
          originalUrl,
        },
        (context) => {
          expect(context.sessionId).toBe(hash('admin-session'));
        },
      );
    },
  );

  it('does not substitute a user cookie on an admin route', () => {
    const service = new SecurityRequestContextService();

    service.run(
      {
        headers: { cookie: 'cloudtodo_user_session=user-session' },
        originalUrl: '/api/admin/users',
      },
      (context) => {
        expect(context.sessionId).toBeNull();
      },
    );
  });

  it('uses only the user session cookie on a non-admin route', () => {
    const service = new SecurityRequestContextService();

    service.run(
      {
        headers: {
          cookie: [
            'cloudtodo_user_session=user-session',
            'cloudtodo_admin_session=admin-session',
          ].join('; '),
        },
        originalUrl: '/api/users/me?include=profile',
      },
      (context) => {
        expect(context.sessionId).toBe(hash('user-session'));
      },
    );
  });
});
