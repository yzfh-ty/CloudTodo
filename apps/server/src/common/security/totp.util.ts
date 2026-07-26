import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(encoded: string): Buffer {
  const normalized = encoded.toUpperCase().replace(/=+$/u, '').replace(/\s+/gu, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('invalid base32 character');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCodeAt(secretBase32: string, timestampMs: number): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secretBase32))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Matches a TOTP code against the current time step and one step on either
 * side to tolerate small clock drift. Returns the matched step counter so
 * callers can persist it and refuse replays within the drift window
 * (RFC 6238 §5.2: a verifier must not accept the same OTP twice).
 */
export function matchTotpStep(
  secretBase32: string,
  code: string,
  nowMs = Date.now(),
): number | null {
  const provided = code.trim();
  if (!/^\d{6}$/u.test(provided)) {
    return null;
  }
  const providedBuffer = Buffer.from(provided, 'utf8');
  for (const stepOffset of [0, -1, 1]) {
    const stepMs = nowMs + stepOffset * TOTP_PERIOD_SECONDS * 1000;
    const expected = totpCodeAt(secretBase32, stepMs);
    if (timingSafeEqual(providedBuffer, Buffer.from(expected, 'utf8'))) {
      return Math.floor(stepMs / 1000 / TOTP_PERIOD_SECONDS);
    }
  }
  return null;
}

export function verifyTotpCode(
  secretBase32: string,
  code: string,
  nowMs = Date.now(),
): boolean {
  return matchTotpStep(secretBase32, code, nowMs) !== null;
}

export function buildOtpauthUri(
  issuer: string,
  accountName: string,
  secretBase32: string,
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
