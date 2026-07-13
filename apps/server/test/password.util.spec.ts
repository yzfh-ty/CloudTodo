import { hashPassword, verifyPassword } from '../src/common/security/password.util';

describe('password util', () => {
  it('hashes and verifies password', () => {
    const password = 'secret-123';
    const hash = hashPassword(password);

    expect(hash).not.toBe(password);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects unsupported password hash formats', () => {
    expect(verifyPassword('plain', 'plain')).toBe(false);
    expect(verifyPassword('plain', 'unsupported$hash')).toBe(false);
  });
});
