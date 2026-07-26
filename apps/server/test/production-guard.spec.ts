import {
  assertProductionSecrets,
  isHttpsOrigin,
  isStrongSecret,
} from '../src/common/config/production-guard';

const productionEnv = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'A1!access-secret-for-production-0001',
  JWT_REFRESH_SECRET: 'B2!refresh-secret-for-production-0002',
  WEBHOOK_SIGNING_SECRET: 'C3!webhook-secret-for-production-0003',
  ADMIN_SESSION_SECRET: 'D4!admin-secret-for-production-000004',
  CSRF_SECRET: 'E5!csrf-secret-for-production-0000005',
  WEBHOOK_SECRET_ENCRYPTION_KEY: 'F6!encryption-key-for-production-0006',
  PASSWORD_RESET_TOKEN_SECRET: 'G7!reset-secret-for-production-000007',
  DATABASE_URL:
    'postgresql://app_user:H8%21database-password-for-production@db.internal.example.net:5432/cloudtodo',
  APP_BASE_URL: 'https://todo.example.net',
  COOKIE_SECURE: 'true',
  CORS_ORIGINS: 'https://todo.example.net,https://admin.example.net',
  WEBHOOK_ALLOW_PRIVATE_NETWORKS: 'false',
};

describe('production configuration guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv, productionEnv);
    delete process.env.ADMIN_SEED_PASSWORD;
    delete process.env.DEMO_USER_PASSWORD;
  });

  afterAll(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('accepts an explicit production configuration', () => {
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it.each([
    ['JWT_ACCESS_SECRET', 'change-me-access-secret'],
    ['JWT_REFRESH_SECRET', 'x'.repeat(64)],
    ['WEBHOOK_SIGNING_SECRET', 'REPLACE_WITH_32_BYTE_RANDOM_SECRET'],
  ])('rejects an unsafe %s', (key, value) => {
    process.env[key] = value;
    expect(() => assertProductionSecrets()).toThrow(key);
  });

  it('rejects insecure external URLs and cookie settings', () => {
    process.env.APP_BASE_URL = 'http://localhost:3000';
    process.env.COOKIE_SECURE = 'false';
    expect(() => assertProductionSecrets()).toThrow('APP_BASE_URL');
  });

  it('rejects weak database credentials', () => {
    process.env.DATABASE_URL =
      'postgresql://cloudtodo:cloudtodo@db.internal.example.net:5432/cloudtodo';
    expect(() => assertProductionSecrets()).toThrow('DATABASE_URL');
  });

  it.each([
    'localhost.',
    '127.0.0.1',
    '127.42.5.6',
    '0.0.0.0',
    '[::1]',
    '[::]',
    '[::ffff:127.0.0.1]',
  ])('rejects a local production database host: %s', (hostname) => {
    process.env.DATABASE_URL =
      `postgresql://app_user:H8%21database-password-for-production@${hostname}:5432/cloudtodo`;
    expect(() => assertProductionSecrets()).toThrow(
      'DATABASE_URL must not point to a local host',
    );
  });

  it.each([
    'db.internal.example.net',
    '8.8.8.8',
    '[2001:4860:4860::8888]',
    '[::ffff:8.8.8.8]',
  ])('accepts a non-local production database host: %s', (hostname) => {
    process.env.DATABASE_URL =
      `postgresql://app_user:H8%21database-password-for-production@${hostname}:5432/cloudtodo`;
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it('rejects CSRF origins outside the application CORS boundary', () => {
    process.env.CSRF_TRUSTED_ORIGINS = 'https://attacker.example.net';
    expect(() => assertProductionSecrets()).toThrow('CSRF_TRUSTED_ORIGINS');
  });

  it('rejects broad trusted proxy ranges', () => {
    process.env.TRUSTED_PROXY_IPS = '0.0.0.0/0';
    expect(() => assertProductionSecrets()).toThrow('TRUSTED_PROXY_IPS');
  });
});

describe('production guard helpers', () => {
  it('requires non-placeholder, varied secrets', () => {
    expect(isStrongSecret('A1!sufficiently-random-production-key-123')).toBe(true);
    expect(isStrongSecret('a'.repeat(64))).toBe(false);
    expect(isStrongSecret('REPLACE_WITH_32_BYTE_RANDOM_SECRET')).toBe(false);
    expect(isStrongSecret('replace-with-a-32+-character-random-secret')).toBe(false);
  });

  it('accepts only canonical non-local HTTPS origins', () => {
    expect(isHttpsOrigin('https://todo.example.net')).toBe(true);
    expect(isHttpsOrigin('https://8.8.8.8')).toBe(true);
    expect(isHttpsOrigin('https://[2001:4860:4860::8888]')).toBe(true);
    expect(isHttpsOrigin('https://[::ffff:8.8.8.8]')).toBe(true);
    expect(isHttpsOrigin('https://todo.example.net/path')).toBe(false);
    expect(isHttpsOrigin('http://todo.example.net')).toBe(false);
    expect(isHttpsOrigin('https://localhost')).toBe(false);
    expect(isHttpsOrigin('https://localhost.')).toBe(false);
    expect(isHttpsOrigin('https://service.localhost.')).toBe(false);
    expect(isHttpsOrigin('https://127.255.255.254')).toBe(false);
    expect(isHttpsOrigin('https://0.0.0.0')).toBe(false);
    expect(isHttpsOrigin('https://[::1]')).toBe(false);
    expect(isHttpsOrigin('https://[::]')).toBe(false);
    expect(isHttpsOrigin('https://[::ffff:127.0.0.1]')).toBe(false);
  });
});
