import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../src/common/database/prisma.service';
import {
  getAdminOperationLogs,
  getAdminUsers,
} from '../src/modules/admin/admin-query.functions';
import { AdminOperationLogQueryDto } from '../src/modules/admin/dto/admin-operation-log-query.dto';
import { AdminUserListQueryDto } from '../src/modules/admin/dto/admin-user-list-query.dto';

function createPrisma() {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    adminOperationLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return prisma;
}

describe('admin query bounds', () => {
  it.each([AdminUserListQueryDto, AdminOperationLogQueryDto])(
    'rejects excessive offset pages for %p',
    async (Dto) => {
      const query = plainToInstance(Dto, { page: '501', page_size: '100' });
      const errors = await validate(query);
      expect(errors.some((error) => error.property === 'page')).toBe(true);
    },
  );

  it('rejects inverted user date ranges before querying the database', async () => {
    const prisma = createPrisma();
    await expect(
      getAdminUsers(prisma as unknown as PrismaService, {
        created_start: '2026-02-01T00:00:00.000Z',
        created_end: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses a deterministic id tie-breaker for user pages', async () => {
    const prisma = createPrisma();
    await getAdminUsers(prisma as unknown as PrismaService, {
      page: 2,
      page_size: 20,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('uses a deterministic id tie-breaker for audit-log pages', async () => {
    const prisma = createPrisma();
    await getAdminOperationLogs(prisma as unknown as PrismaService, {
      page: 2,
      page_size: 20,
    });

    expect(prisma.adminOperationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it.each([
    ['users', 'user' as const, getAdminUsers],
    ['operation logs', 'adminOperationLog' as const, getAdminOperationLogs],
  ])(
    'clamps %s pagination even when the DTO layer is bypassed',
    async (_label, model, query) => {
      const prisma = createPrisma();
      await query(prisma as unknown as PrismaService, {
        page: 999_999,
        page_size: 100_000,
      });

      expect(prisma[model].findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: (500 - 1) * 100,
        }),
      );
    },
  );
});
