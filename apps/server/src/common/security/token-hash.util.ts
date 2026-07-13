import { createHmac } from 'node:crypto';

export function hashResetToken(token: string) {
  return `hmac-sha256$${createHmac('sha256', getResetTokenSecret())
    .update(token)
    .digest('hex')}`;
}

function getResetTokenSecret() {
  const secret =
    process.env.PASSWORD_RESET_TOKEN_SECRET ??
    process.env.JWT_ACCESS_SECRET ??
    process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error('PASSWORD_RESET_TOKEN_SECRET or a session secret is required');
  }

  return secret;
}
