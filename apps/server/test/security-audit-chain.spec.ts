import {
  AUDIT_CHAIN_GENESIS,
  computeAuditEntryHash,
  verifyAuditChain,
} from '../src/common/security/security-audit.service';

type ChainRow = Parameters<typeof verifyAuditChain>[0][number];

function buildChain(count: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prevHash = AUDIT_CHAIN_GENESIS;
  for (let index = 0; index < count; index += 1) {
    const entry = {
      id: `00000000-0000-0000-0000-00000000000${index}`,
      action: 'user_login_success',
      result: 'success',
      actorUserId: null,
      targetUserId: null,
      ipAddress: '203.0.113.1',
      sessionId: null,
      requestId: `req-${index}`,
      metadata: { step: index },
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
    };
    const entryHash = computeAuditEntryHash(prevHash, entry);
    rows.push({ ...entry, chainSeq: index + 1, prevHash, entryHash });
    prevHash = entryHash;
  }
  return rows;
}

describe('security audit hash chain', () => {
  it('produces deterministic, prev-dependent hashes', () => {
    const [first] = buildChain(1);
    expect(first.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      computeAuditEntryHash(AUDIT_CHAIN_GENESIS, first),
    ).toBe(first.entryHash);
    expect(computeAuditEntryHash('f'.repeat(64), first)).not.toBe(first.entryHash);
  });

  it('accepts an intact chain and skips pre-chain rows', () => {
    const legacyRow = {
      ...buildChain(1)[0],
      chainSeq: 0,
      prevHash: null,
      entryHash: null,
    };
    const rows = [legacyRow, ...buildChain(3)];
    expect(verifyAuditChain(rows)).toEqual({ valid: true });
  });

  it('detects a tampered field', () => {
    const rows = buildChain(3);
    rows[1] = { ...rows[1], ipAddress: '198.51.100.99' };
    expect(verifyAuditChain(rows)).toEqual({
      valid: false,
      brokenAtChainSeq: 2,
    });
  });

  it('detects a deleted entry in the middle of the chain', () => {
    const rows = buildChain(3);
    rows.splice(1, 1);
    expect(verifyAuditChain(rows)).toEqual({
      valid: false,
      brokenAtChainSeq: 3,
    });
  });

  it('detects a re-linked (forged) predecessor hash', () => {
    const rows = buildChain(3);
    // Recompute entry 3 so it verifies alone but points at entry 1 instead of 2.
    const forgedPrev = rows[0].entryHash as string;
    rows[2] = {
      ...rows[2],
      prevHash: forgedPrev,
      entryHash: computeAuditEntryHash(forgedPrev, rows[2]),
    };
    expect(verifyAuditChain(rows)).toEqual({
      valid: false,
      brokenAtChainSeq: 3,
    });
  });
});
