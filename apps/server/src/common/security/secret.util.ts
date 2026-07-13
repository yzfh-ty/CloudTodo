import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTED_SECRET_PREFIX = 'enc:v1:';

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const key = getEncryptionKey();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTED_SECRET_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(value: string) {
  if (!value.startsWith(ENCRYPTED_SECRET_PREFIX)) {
    return value;
  }

  const [, , ivBase64, tagBase64, ciphertextBase64] = value.split(':');
  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new Error('encrypted secret is malformed');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivBase64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function getEncryptionKey() {
  const secret =
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ??
    process.env.WEBHOOK_SIGNING_SECRET ??
    process.env.JWT_ACCESS_SECRET ??
    process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY or a session secret is required');
  }

  return createHash('sha256').update(secret).digest();
}
