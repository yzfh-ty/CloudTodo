import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotpSecret,
  matchTotpStep,
  totpCodeAt,
  verifyTotpCode,
} from '../src/common/security/totp.util';

// RFC 6238 appendix B test vectors (HMAC-SHA1, 8 digits truncated to 6 here
// by comparing the trailing digits of the published values).
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp.util', () => {
  it('base32 round-trips arbitrary buffers', () => {
    const buffer = Buffer.from(RFC_SECRET_ASCII, 'utf8');
    expect(base32Encode(buffer)).toBe(RFC_SECRET_BASE32);
    expect(base32Decode(RFC_SECRET_BASE32).equals(buffer)).toBe(true);
  });

  it.each([
    [59_000, '287082'],
    [1_111_111_109_000, '081804'],
    [1_111_111_111_000, '050471'],
    [1_234_567_890_000, '005924'],
    [2_000_000_000_000, '279037'],
  ])('matches the RFC 6238 SHA-1 vector at %d ms', (timestampMs, expected) => {
    expect(totpCodeAt(RFC_SECRET_BASE32, timestampMs as number)).toBe(expected);
  });

  it('accepts the current code and one adjacent step', () => {
    const now = 1_234_567_890_000;
    const current = totpCodeAt(RFC_SECRET_BASE32, now);
    const previous = totpCodeAt(RFC_SECRET_BASE32, now - 30_000);
    const twoStepsBack = totpCodeAt(RFC_SECRET_BASE32, now - 60_000);

    expect(verifyTotpCode(RFC_SECRET_BASE32, current, now)).toBe(true);
    expect(verifyTotpCode(RFC_SECRET_BASE32, previous, now)).toBe(true);
    expect(verifyTotpCode(RFC_SECRET_BASE32, twoStepsBack, now)).toBe(false);
  });

  it('reports the exact time step a code matched', () => {
    const now = 1_234_567_890_000;
    const currentStep = Math.floor(now / 1000 / 30);
    const current = totpCodeAt(RFC_SECRET_BASE32, now);
    const previous = totpCodeAt(RFC_SECRET_BASE32, now - 30_000);

    expect(matchTotpStep(RFC_SECRET_BASE32, current, now)).toBe(currentStep);
    expect(matchTotpStep(RFC_SECRET_BASE32, previous, now)).toBe(currentStep - 1);
    expect(matchTotpStep(RFC_SECRET_BASE32, '000000', now)).toBeNull();
  });

  it('rejects malformed codes without throwing', () => {
    expect(verifyTotpCode(RFC_SECRET_BASE32, '')).toBe(false);
    expect(verifyTotpCode(RFC_SECRET_BASE32, '12345')).toBe(false);
    expect(verifyTotpCode(RFC_SECRET_BASE32, 'abcdef')).toBe(false);
    expect(verifyTotpCode(RFC_SECRET_BASE32, '1234567')).toBe(false);
  });

  it('generates distinct base32 secrets', () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();
    expect(first).toMatch(/^[A-Z2-7]{32}$/u);
    expect(first).not.toBe(second);
  });

  it('builds an otpauth URI with issuer and account', () => {
    const uri = buildOtpauthUri('CloudTodo', 'admin@example.com', RFC_SECRET_BASE32);
    expect(uri).toContain('otpauth://totp/CloudTodo:admin%40example.com');
    expect(uri).toContain(`secret=${RFC_SECRET_BASE32}`);
    expect(uri).toContain('issuer=CloudTodo');
    expect(uri).toContain('digits=6');
  });
});
