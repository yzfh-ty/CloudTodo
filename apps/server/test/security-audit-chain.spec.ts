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
      chainIndex: BigInt(index + 1),
    };
    const entryHash = computeAuditEntryHash(prevHash, entry);
    rows.push({ ...entry, chainSeq: index + 1, prevHash, entryHash });
    prevHash = entryHash;
  }
  return rows;
}

function headOf(rows: ChainRow[]) {
  const last = rows[rows.length - 1];
  return { chainIndex: last.chainIndex as bigint, entryHash: last.entryHash as string };
}

describe('security audit hash chain', () => {
  it('produces deterministic, prev-dependent hashes', () => {
    const [first] = buildChain(1);
    expect(first.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeAuditEntryHash(AUDIT_CHAIN_GENESIS, first)).toBe(first.entryHash);
    expect(computeAuditEntryHash('f'.repeat(64), first)).not.toBe(first.entryHash);
  });

  it('is stable when metadata keys come back in a different order', () => {
    // Postgres jsonb canonicalises key order on write, so the object read back
    // is never guaranteed to enumerate in the order it was written.
    const [entry] = buildChain(1);
    const written = {
      ...entry,
      metadata: { delivery_id: 'd1', endpoint_id: 'e1', status: 200 },
    };
    const readBack = {
      ...entry,
      metadata: { status: 200, delivery_id: 'd1', endpoint_id: 'e1' },
    };
    expect(computeAuditEntryHash(AUDIT_CHAIN_GENESIS, readBack)).toBe(
      computeAuditEntryHash(AUDIT_CHAIN_GENESIS, written),
    );
  });

  it('is stable for nested objects inside arrays', () => {
    const [entry] = buildChain(1);
    const written = { ...entry, metadata: { items: [{ a: 1, b: 2 }] } };
    const readBack = { ...entry, metadata: { items: [{ b: 2, a: 1 }] } };
    expect(computeAuditEntryHash(AUDIT_CHAIN_GENESIS, readBack)).toBe(
      computeAuditEntryHash(AUDIT_CHAIN_GENESIS, written),
    );
  });

  it('still separates entries that differ in metadata content', () => {
    const [entry] = buildChain(1);
    const a = computeAuditEntryHash(AUDIT_CHAIN_GENESIS, {
      ...entry,
      metadata: { a: 1, b: 2 },
    });
    const b = computeAuditEntryHash(AUDIT_CHAIN_GENESIS, {
      ...entry,
      metadata: { a: 2, b: 1 },
    });
    expect(a).not.toBe(b);
  });

  it('binds the chain index into the hash', () => {
    const [entry] = buildChain(1);
    expect(
      computeAuditEntryHash(AUDIT_CHAIN_GENESIS, { ...entry, chainIndex: 9n }),
    ).not.toBe(entry.entryHash);
  });

  it('accepts an intact chain and skips pre-chain rows', () => {
    const legacyRow = {
      ...buildChain(1)[0],
      chainSeq: 0,
      chainIndex: null,
      prevHash: null,
      entryHash: null,
    };
    const rows = [legacyRow, ...buildChain(3)];
    expect(verifyAuditChain(rows)).toMatchObject({ valid: true, checked: 3 });
  });

  it('accepts an intact chain against its published head', () => {
    const rows = buildChain(3);
    expect(verifyAuditChain(rows, headOf(rows))).toMatchObject({ valid: true });
  });

  it('detects a tampered field', () => {
    const rows = buildChain(3);
    rows[1] = { ...rows[1], ipAddress: '198.51.100.99' };
    expect(verifyAuditChain(rows)).toMatchObject({
      valid: false,
      brokenAtChainSeq: 2,
      reason: 'entry_hash_mismatch',
    });
  });

  it('detects a deleted entry in the middle of the chain', () => {
    const rows = buildChain(3);
    rows.splice(1, 1);
    expect(verifyAuditChain(rows)).toMatchObject({
      valid: false,
      brokenAtChainSeq: 3,
      reason: 'chain_index_gap',
    });
  });

  it('detects a deleted prefix of the chain', () => {
    // Without a genesis anchor the surviving suffix verifies internally, which
    // makes "delete the first N rows" a free tamper.
    const rows = buildChain(4).slice(2);
    expect(verifyAuditChain(rows)).toMatchObject({
      valid: false,
      reason: 'genesis_mismatch',
    });
  });

  it('detects a deleted prefix even when the indices are renumbered', () => {
    const rows = buildChain(4)
      .slice(2)
      .map((row, offset) => ({ ...row, chainIndex: BigInt(offset + 1) }));
    expect(verifyAuditChain(rows)).toMatchObject({ valid: false });
  });

  it('detects a truncated tail against the published head', () => {
    const rows = buildChain(4);
    const head = headOf(rows);
    expect(verifyAuditChain(rows.slice(0, 2), head)).toMatchObject({
      valid: false,
      reason: 'head_mismatch',
    });
  });

  it('detects a fully emptied table against the published head', () => {
    const head = headOf(buildChain(3));
    expect(verifyAuditChain([], head)).toMatchObject({
      valid: false,
      reason: 'head_mismatch',
    });
  });

  it('detects a re-linked (forged) predecessor hash', () => {
    const rows = buildChain(3);
    const forgedPrev = rows[0].entryHash as string;
    rows[2] = {
      ...rows[2],
      prevHash: forgedPrev,
      entryHash: computeAuditEntryHash(forgedPrev, rows[2]),
    };
    expect(verifyAuditChain(rows)).toMatchObject({
      valid: false,
      brokenAtChainSeq: 3,
      reason: 'prev_hash_mismatch',
    });
  });

  it('detects a row excised by blanking its chain index', () => {
    // Demoting a row to "pre-chain" is the obvious way to hide it now that
    // rows without a chain index are skipped, so the gap check must catch it.
    const rows = buildChain(3);
    rows[1] = { ...rows[1], chainIndex: null };
    expect(verifyAuditChain(rows)).toMatchObject({
      valid: false,
      reason: 'chain_index_gap',
    });
  });
});
