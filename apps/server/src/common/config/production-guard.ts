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
]);

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  for (const key of [
    'JWT_ACCESS_SECRET',
    'ADMIN_SESSION_SECRET',
    'CSRF_SECRET',
    'WEBHOOK_SECRET_ENCRYPTION_KEY',
    'PASSWORD_RESET_TOKEN_SECRET',
  ]) {
    const value = process.env[key];
    if (!value || value.length < 32 || INSECURE_SECRET_VALUES.has(value)) {
      throw new Error(`${key} must be set to a strong secret in production`);
    }
  }

  const webhookSigningSecret = process.env.WEBHOOK_SIGNING_SECRET;
  if (webhookSigningSecret && INSECURE_SECRET_VALUES.has(webhookSigningSecret)) {
    throw new Error('WEBHOOK_SIGNING_SECRET must not use an insecure default in production');
  }
}
