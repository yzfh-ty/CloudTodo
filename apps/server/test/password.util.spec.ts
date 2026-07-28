import { scryptSync } from 'node:crypto';
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from '../src/common/security/password.util';

describe('password util', () => {
  it('hashes with asynchronous Argon2id and verifies password', async () => {
    const password = 'secret-123';
    const hashing = hashPassword(password);
    expect(hashing).toBeInstanceOf(Promise);
    const hash = await hashing;

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it('verifies legacy scrypt hashes and marks them for an upgrade', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const derived = scryptSync('legacy-password', salt, 64).toString('hex');
    const legacyHash = `scrypt$${salt}$${derived}`;

    await expect(verifyPassword('legacy-password', legacyHash)).resolves.toBe(true);
    expect(passwordNeedsRehash(legacyHash)).toBe(true);
  });

  it('rejects unsupported password hash formats', async () => {
    await expect(verifyPassword('plain', 'plain')).resolves.toBe(false);
    await expect(verifyPassword('plain', 'unsupported$hash')).resolves.toBe(false);
  });
});
