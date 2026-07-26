import { isIP } from 'node:net';
import ipaddr = require('ipaddr.js');

const INSECURE_SECRET_VALUES = new Set([
  'change-me-access-secret',
  'change-me-refresh-secret',
  'change-me-webhook-secret',
  'change-me-admin-session-secret',
  'change-me-csrf-secret',
  'change-me-webhook-secret-encryption-key',
  'change-me-password-reset-token-secret',
  'local-access-secret',
  'local-refresh-secret',
  'local-webhook-secret',
  'local-admin-session-secret',
  'local-csrf-secret',
  'local-webhook-secret-encryption-key',
  'local-password-reset-token-secret',
  'change-me-db-password',
  'cloudtodo',
  'change-me-admin-password',
  'admin123456',
  'demo123456',
]);

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  for (const key of [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'WEBHOOK_SIGNING_SECRET',
    'ADMIN_SESSION_SECRET',
    'CSRF_SECRET',
    'WEBHOOK_SECRET_ENCRYPTION_KEY',
    'PASSWORD_RESET_TOKEN_SECRET',
  ]) {
    const value = process.env[key];
    if (!isStrongSecret(value)) {
      throw new Error(`${key} must be set to a strong secret in production`);
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set in production');
  }

  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL in production');
  }

  if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL in production');
  }

  const databasePassword = decodeURIComponent(database.password);
  if (!database.username || !databasePassword || !isStrongSecret(databasePassword)) {
    throw new Error('DATABASE_URL must contain a strong database password in production');
  }

  if (isLocalHost(database.hostname)) {
    throw new Error('DATABASE_URL must not point to a local host in production');
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl || !isHttpsOrigin(appBaseUrl)) {
    throw new Error('APP_BASE_URL must be an HTTPS URL in production');
  }

  if (process.env.COOKIE_SECURE !== 'true') {
    throw new Error('COOKIE_SECURE=true is required in production');
  }

  const corsOrigins = parseOrigins(process.env.CORS_ORIGINS);
  if (corsOrigins.length === 0 || corsOrigins.some((origin) => !isHttpsOrigin(origin))) {
    throw new Error('CORS_ORIGINS must contain explicit HTTPS origins in production');
  }

  const allowedCsrfOrigins = new Set([
    new URL(appBaseUrl).origin,
    ...corsOrigins.map((origin) => new URL(origin).origin),
  ]);
  const csrfOrigins = parseOrigins(process.env.CSRF_TRUSTED_ORIGINS);
  if (
    csrfOrigins.some(
      (origin) => !isHttpsOrigin(origin) || !allowedCsrfOrigins.has(new URL(origin).origin),
    )
  ) {
    throw new Error(
      'CSRF_TRUSTED_ORIGINS must contain only APP_BASE_URL or CORS_ORIGINS HTTPS origins',
    );
  }

  const trustedProxyIps = parseOrigins(process.env.TRUSTED_PROXY_IPS);
  if (trustedProxyIps.some((address) => isIP(normalizeIpAddress(address)) === 0)) {
    throw new Error('TRUSTED_PROXY_IPS must contain only explicit IP addresses in production');
  }

  if (process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === 'true') {
    throw new Error('WEBHOOK_ALLOW_PRIVATE_NETWORKS must be false in production');
  }

  for (const key of ['ADMIN_SEED_PASSWORD', 'DEMO_USER_PASSWORD']) {
    const value = process.env[key];
    if (value !== undefined && !isStrongSecret(value)) {
      throw new Error(`${key} must not use a weak value in production`);
    }
  }
}

export function isStrongSecret(value: string | undefined): value is string {
  if (!value || value.length < 32 || INSECURE_SECRET_VALUES.has(value)) {
    return false;
  }

  // Reject obvious placeholders and low-entropy repeated values even when long.
  if (
    /^(.)\1+$/.test(value) ||
    /^(?:secret|password|change|local|test)[-_]/i.test(value) ||
    /(?:replace[-_ ]with|your[-_ ]|example|placeholder|todo)/i.test(value)
  ) {
    return false;
  }

  let characterClasses = 0;
  if (/[a-z]/.test(value)) characterClasses += 1;
  if (/[A-Z]/.test(value)) characterClasses += 1;
  if (/\d/.test(value)) characterClasses += 1;
  if (/[^A-Za-z\d]/.test(value)) characterClasses += 1;
  return characterClasses >= 3;
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.pathname.replace(/\/$/, '') &&
      !url.search &&
      !url.hash &&
      !isLocalHost(url.hostname)
    );
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string) {
  const normalized = hostname
    .trim()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.+$/, '')
    .toLowerCase();

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  try {
    // process() converts IPv4-mapped IPv6 addresses before classifying them.
    const address = ipaddr.process(normalized);
    return address.range() === 'loopback' || address.range() === 'unspecified';
  } catch {
    return false;
  }
}

function normalizeIpAddress(address: string) {
  return address.replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '');
}
