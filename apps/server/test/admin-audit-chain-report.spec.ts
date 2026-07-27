import { AdminService } from '../src/modules/admin/admin.service';
import type { AuditChainReport } from '../src/common/security/security-audit.service';

function buildService(report: AuditChainReport) {
  const verifyChain = jest.fn().mockResolvedValue(report);
  const service = new AdminService(
    {} as never,
    { verifyChain } as never,
    {} as never,
    {} as never,
  );
  return { service, verifyChain };
}

describe('AdminService.verifySecurityAuditChain', () => {
  it('reports an intact chain in a JSON-serialisable shape', async () => {
    // chainIndex is a BigInt in the database layer, and Express would throw
    // "Do not know how to serialize a BigInt" if it reached the response.
    const { service, verifyChain } = buildService({
      valid: true,
      checked: 12,
      head: { chainIndex: 12n, entryHash: 'a'.repeat(64) },
    });

    const result = await service.verifySecurityAuditChain();
    expect(verifyChain).toHaveBeenCalled();
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).toEqual({
      code: 'OK',
      message: 'success',
      data: {
        valid: true,
        checked_entries: 12,
        reason: null,
        broken_at_chain_seq: null,
        head: { chain_index: '12', entry_hash: 'a'.repeat(64) },
      },
    });
  });

  it('surfaces the failure reason and the position of the break', async () => {
    const { service } = buildService({
      valid: false,
      checked: 3,
      reason: 'entry_hash_mismatch',
      brokenAtChainSeq: 128n,
      head: { chainIndex: 9n, entryHash: 'b'.repeat(64) },
    });

    const result = await service.verifySecurityAuditChain();
    expect(result.data).toMatchObject({
      valid: false,
      checked_entries: 3,
      reason: 'entry_hash_mismatch',
      broken_at_chain_seq: '128',
    });
  });

  it('handles a chain that has never been written', async () => {
    const { service } = buildService({ valid: true, checked: 0, head: null });
    const result = await service.verifySecurityAuditChain();
    expect(result.data).toMatchObject({ valid: true, checked_entries: 0, head: null });
  });
});
