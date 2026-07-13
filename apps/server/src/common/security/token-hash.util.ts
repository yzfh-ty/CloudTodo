import { createHmac } from 'node:crypto';

export function hashResetToken(token: string) {
  return `hmac-sha256$${createHmac('sha256', getResetTokenSecret())
    .update(token)
    .digest('hex')}`;
}

function getResetTokenSecret() {
  const secret = process.env.PASSWORD_RESET_TOKEN_SECRET;

  if (!secret) {
    throw new Error('PASSWORD_RESET_TOKEN_SECRET is required');
  }

  return secret;
}
