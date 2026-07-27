import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { SecurityRequestContextService } from '../src/common/security/security-request-context.service';
import {
  SecurityAuditService,
  verifyAuditChain,
} from '../src/common/security/security-audit.service';

const databaseUrl = process.env.DATABASE_URL;
// This suite resets the live chain segment, so it refuses to touch anything
// that is not obviously a test database.
const isTestDatabase = Boolean(databaseUrl && /_test(\?|$)/.test(databaseUrl.split('/').pop() ?? ''));
const describeWithPostgres = databaseUrl && isTestDatabase ? describe : describe.skip;

/**
 * The chain's only real failure mode is the Postgres round trip: jsonb
 * canonicalises key order, so an in-memory-only test cannot tell whether the
 * hash a reader recomputes matches the one the writer stored.
 */
describeWithPostgres('security audit chain survives a PostgreSQL round trip', () => {
  const requestId = 'chain-roundtrip-test';
  let prisma: PrismaClient;
  let service: SecurityAuditService;

  const requestContext = {
    current: () => ({ ipAddress: '203.0.113.10', requestId, sessionId: null }),
  } as unknown as SecurityRequestContextService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    service = new SecurityAuditService(
      prisma as unknown as PrismaService,
      requestContext,
    );
  });

  beforeEach(async () => {
    // Start every case from genesis: rows written before the chain migration
    // carry a null chainIndex and are deliberately left alone.
    await prisma.securityAuditLog.deleteMany({ where: { chainIndex: { not: null } } });
    await prisma.securityAuditChainHead.deleteMany({});
  });

  afterAll(async () => {
    await prisma.securityAuditLog.deleteMany({ where: { chainIndex: { not: null } } });
    await prisma.securityAuditChainHead.deleteMany({});
    await prisma.$disconnect();
  });

  async function readChain() {
    return prisma.securityAuditLog.findMany({
      where: { chainIndex: { not: null } },
      orderBy: { chainSeq: 'asc' },
    });
  }

  async function recordEvents(count: number) {
    for (let index = 0; index < count; index += 1) {
      await service.record({
        action: 'user_login_failure',
        result: 'failure',
        metadata: { attempt: index, reason: 'invalid_credentials', nested: { b: 1, a: 2 } },
      });
    }
  }

  it('recomputes the stored hash from multi-key jsonb metadata', async () => {
    await service.record({
      action: 'webhook_delivery_failed',
      result: 'failure',
      // jsonb sorts keys by length first, so "status" is guaranteed to move
      // ahead of the two longer keys on the way back out.
      metadata: { delivery_id: 'd1', endpoint_id: 'e1', status: 200 },
    });

    const rows = await readChain();
    expect(rows).toHaveLength(1);
    expect(rows[0].entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].chainIndex).toBe(1n);
    expect(rows[0].prevHash).toBe('0'.repeat(64));
    expect(verifyAuditChain(rows)).toMatchObject({ valid: true, checked: 1 });
  });

  it('verifies a multi-entry chain read back from the database', async () => {
    await recordEvents(4);

    const rows = await readChain();
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => Number(row.chainIndex))).toEqual([1, 2, 3, 4]);
    expect(verifyAuditChain(rows)).toMatchObject({ valid: true, checked: 4 });
  });

  it('reports a broken chain when a stored row is edited in place', async () => {
    await recordEvents(3);
    const rows = await readChain();
    await prisma.securityAuditLog.update({
      where: { id: rows[1].id },
      data: { ipAddress: '198.51.100.99' },
    });

    expect(verifyAuditChain(await readChain())).toMatchObject({
      valid: false,
      reason: 'entry_hash_mismatch',
    });
  });

  it('reports a broken chain when a middle row is deleted', async () => {
    await recordEvents(3);
    const rows = await readChain();
    await prisma.securityAuditLog.delete({ where: { id: rows[1].id } });

    expect(verifyAuditChain(await readChain())).toMatchObject({
      valid: false,
      reason: 'chain_index_gap',
    });
  });

  it('verifyChain() walks the live table and reports the head', async () => {
    await recordEvents(3);

    const report = await service.verifyChain();
    expect(report).toMatchObject({ valid: true, checked: 3 });
    expect(report.head?.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(report.head?.chainIndex)).toBe(3);
  });

  it('verifyChain() flags a truncated tail via the persisted head', async () => {
    await recordEvents(3);
    const rows = await readChain();
    const head = await prisma.securityAuditChainHead.findFirst();
    expect(head?.entryHash).toBe(rows[rows.length - 1].entryHash);

    await prisma.securityAuditLog.delete({ where: { id: rows[2].id } });

    const report = await service.verifyChain();
    expect(report).toMatchObject({ valid: false, reason: 'head_mismatch' });
  });

  it('verifyChain() flags a deleted prefix', async () => {
    await recordEvents(3);
    const rows = await readChain();
    await prisma.securityAuditLog.delete({ where: { id: rows[0].id } });

    const report = await service.verifyChain();
    expect(report).toMatchObject({ valid: false, reason: 'genesis_mismatch' });
  });

  it('keeps hashed rows intact when a referenced user is deleted', async () => {
    // SET NULL on the audit foreign keys silently rewrote already-hashed rows;
    // audit rows have to outlive their subjects instead.
    const stamp = `${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email: `audit-fk-test-${stamp}@example.com`,
        username: `audit-fk-test-${stamp}`,
        nickname: 'audit fk test',
        passwordHash: 'scrypt$deadbeef$deadbeef',
        role: 'user',
        status: 'active',
      },
    });

    await service.record({
      action: 'user_login_success',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { source: 'fk' },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const rows = await readChain();
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(user.id);
    expect(verifyAuditChain(rows)).toMatchObject({ valid: true });
  });

  it('keeps admin operation logs when the acting admin is deleted', async () => {
    const stamp = `${Date.now()}`;
    const admin = await prisma.user.create({
      data: {
        email: `audit-adminlog-test-${stamp}@example.com`,
        username: `audit-adminlog-test-${stamp}`,
        nickname: 'audit adminlog test',
        passwordHash: 'scrypt$deadbeef$deadbeef',
        role: 'admin',
        status: 'active',
      },
    });
    const log = await prisma.adminOperationLog.create({
      data: {
        adminUserId: admin.id,
        action: 'disable_user',
        reason: 'audit retention test',
        result: 'success',
      },
    });

    await prisma.user.delete({ where: { id: admin.id } });

    const survivor = await prisma.adminOperationLog.findUnique({ where: { id: log.id } });
    expect(survivor?.adminUserId).toBe(admin.id);
    await prisma.adminOperationLog.delete({ where: { id: log.id } });
  });
});
