import * as argon2 from 'argon2';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const LEGACY_SCRYPT_KEY_LENGTH = 64;
const scryptAsync = promisify(scrypt);
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    if (storedHash.startsWith('$argon2id$')) {
      return await argon2.verify(storedHash, password);
    }

    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const [, salt, hash] = parts;
    const storedKey = Buffer.from(hash, 'hex');
    if (storedKey.length !== LEGACY_SCRYPT_KEY_LENGTH) return false;
    const derivedKey = (await scryptAsync(
      password,
      salt,
      LEGACY_SCRYPT_KEY_LENGTH,
    )) as Buffer;
    return timingSafeEqual(derivedKey, storedKey);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(storedHash: string): boolean {
  if (!storedHash.startsWith('$argon2id$')) return true;
  try {
    return argon2.needsRehash(storedHash, ARGON2_OPTIONS);
  } catch {
    return true;
  }
}

export async function upgradedPasswordHash(
  password: string,
  storedHash: string,
  disabled = false,
): Promise<string | undefined> {
  if (disabled || !passwordNeedsRehash(storedHash)) return undefined;
  return hashPassword(password);
}
