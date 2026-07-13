import { hashPassword, verifyPassword } from '../src/common/security/password.util';

describe('password util', () => {
  it('hashes and verifies password', () => {
    const password = 'secret-123';
    const hash = hashPassword(password);

    expect(hash).not.toBe(password);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('supports legacy plain text fallback only when explicitly enabled', () => {
    const previous = process.env.ALLOW_PLAINTEXT_PASSWORD_VERIFY;
    process.env.ALLOW_PLAINTEXT_PASSWORD_VERIFY = 'true';

    try {
      expect(verifyPassword('plain', 'plain')).toBe(true);
      expect(verifyPassword('plain', 'other')).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOW_PLAINTEXT_PASSWORD_VERIFY;
      } else {
        process.env.ALLOW_PLAINTEXT_PASSWORD_VERIFY = previous;
      }
    }
  });
});
