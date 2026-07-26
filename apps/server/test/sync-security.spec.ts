import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../src/common/database/prisma.service';
import type { AuthenticatedUser } from '../src/modules/auth/user-session.service';
import {
  parseSyncCursor,
  serializeSyncCursor,
} from '../src/modules/sync/sync-cursor.util';
import { SyncService } from '../src/modules/sync/sync.service';
import { TagsService } from '../src/modules/tags/tags.service';

const user = { id: 'user-1' } as AuthenticatedUser;
const stableUpper = new Date('2026-07-23T12:00:00.000Z');

function createSyncPrisma() {
  const findMany = () => jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: user.id }) },
    todoList: { findMany: findMany() },
    tag: { findMany: findMany() },
    todoTag: { findMany: findMany() },
    todo: { findMany: findMany() },
    reminder: { findMany: findMany() },
    reminderEvent: { findMany: findMany() },
    notificationEndpoint: { findMany: findMany() },
    notificationDelivery: { findMany: findMany() },
    device: { findMany: findMany() },
    $queryRaw: jest.fn().mockResolvedValue([{ stableUpper }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  return prisma;
}

describe('bounded sync snapshots', () => {
  it('keeps bootstrap membership and ordering stable across pages', async () => {
    const prisma = createSyncPrisma();
    prisma.todoList.findMany.mockResolvedValue([{ id: 'list-1' }, { id: 'list-2' }]);
    const service = new SyncService(prisma as unknown as PrismaService);
    const snapshot = new Date('2026-01-01T00:00:00.000Z');

    const result = await service.bootstrap(user, {
      page: 2,
      page_size: 1,
      snapshot_at: snapshot.toISOString(),
    });

    expect(prisma.todo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: user.id, createdAt: { lte: snapshot } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: 1,
        take: 2,
      }),
    );
    expect(result.data.cursor).toBe(snapshot.toISOString());
    expect(result.data.has_more).toBe(true);
    expect(result.data.todo_lists).toEqual([{ id: 'list-1' }]);
  });

  it('rejects a client-provided future snapshot', async () => {
    const prisma = createSyncPrisma();
    const service = new SyncService(prisma as unknown as PrismaService);
    await expect(
      service.bootstrap(user, { snapshot_at: '2999-01-01T00:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.todo.findMany).not.toHaveBeenCalled();
  });

  it('establishes the database snapshot barrier before reading collections', async () => {
    const prisma = createSyncPrisma();
    const service = new SyncService(prisma as unknown as PrismaService);

    const result = await service.changes(user, {
      cursor: '2026-01-01T00:00:00.000Z',
      page_size: 1,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.todo.findMany.mock.invocationCallOrder[0],
    );
    expect(result.data.cursor).toBe(stableUpper.toISOString());
  });

  it('returns the complete current tag set for each changed todo', async () => {
    const prisma = createSyncPrisma();
    prisma.todo.findMany.mockResolvedValue([
      { id: 'todo-1', updatedAt: new Date('2026-01-01T00:01:00.000Z') },
    ]);
    prisma.todoTag.findMany.mockResolvedValue([
      { todoId: 'todo-1', tagId: 'tag-1' },
      { todoId: 'todo-1', tagId: 'tag-2' },
    ]);
    const service = new SyncService(prisma as unknown as PrismaService);

    const result = await service.changes(user, {
      cursor: '2026-01-01T00:00:00.000Z',
      page_size: 1,
    });

    expect(prisma.todoTag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          todoId: { in: ['todo-1'] },
          todo: { userId: user.id },
        },
      }),
    );
    expect(result.data.todo_tags).toHaveLength(2);
  });

  it('tracks reminder event status changes by updatedAt', async () => {
    const prisma = createSyncPrisma();
    const service = new SyncService(prisma as unknown as PrismaService);
    const cursor = '2026-01-01T00:00:00.000Z';

    await service.changes(user, { cursor, page_size: 1 });

    expect(prisma.reminderEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: user.id,
          updatedAt: {
            gt: new Date(cursor),
            lte: expect.any(Date),
          },
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: expect.objectContaining({ updatedAt: true }),
      }),
    );
  });

  it('rejects a different page_size for an opaque continuation cursor', async () => {
    const prisma = createSyncPrisma();
    const service = new SyncService(prisma as unknown as PrismaService);
    const cursor = serializeSyncCursor(
      {
        base: new Date('2026-01-01T00:00:00.000Z'),
        upper: new Date('2026-01-02T00:00:00.000Z'),
        page: 1,
        pageSize: 25,
        positions: {},
        done: {},
        mode: 'keyset',
      },
      2,
    );

    await expect(
      service.changes(user, { cursor, page_size: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.todo.findMany).not.toHaveBeenCalled();
  });

  it('advances populated collections and marks empty collections done', async () => {
    const prisma = createSyncPrisma();
    const firstListId = '00000000-0000-0000-0000-000000000001';
    const secondListId = '00000000-0000-0000-0000-000000000002';
    const firstUpdatedAt = new Date('2026-01-01T00:01:00.000Z');
    const secondUpdatedAt = new Date('2026-01-01T00:02:00.000Z');
    prisma.todoList.findMany
      .mockResolvedValueOnce([
        { id: firstListId, updatedAt: firstUpdatedAt },
        { id: secondListId, updatedAt: secondUpdatedAt },
      ])
      .mockResolvedValueOnce([]);
    const service = new SyncService(prisma as unknown as PrismaService);

    const first = await service.changes(user, {
      cursor: '2025-12-31T00:00:00.000Z',
      page_size: 1,
    });
    expect(first.data.has_more).toBe(true);
    const cursor = first.data.cursor;
    const parsed = parseSyncCursor(cursor, 1, new Date());
    expect(parsed.mode).toBe('keyset');
    expect(parsed.page).toBe(2);
    expect(parsed.positions.todo_lists).toEqual({
      at: firstUpdatedAt,
      id: firstListId,
    });
    expect(parsed.done.todo_lists).toBe(false);
    expect(parsed.done.tags).toBe(true);

    await service.changes(user, { cursor, page_size: 1 });
    expect(prisma.todoList.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: user.id,
          OR: [
            { updatedAt: { gt: firstUpdatedAt, lte: expect.any(Date) } },
            {
              updatedAt: { equals: firstUpdatedAt },
              id: { gt: firstListId },
            },
          ],
        },
        skip: 0,
        take: 2,
      }),
    );
    expect(prisma.tag.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: user.id,
          id: { in: [] },
        },
        skip: 0,
        take: 2,
      }),
    );
  });
});

describe('tag relation changes', () => {
  it('touches affected todos when deleting a tag', async () => {
    const transaction = {
      todoTag: {
        findMany: jest.fn().mockResolvedValue([{ todoId: 'todo-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      todo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      tag: { update: jest.fn().mockResolvedValue({ id: 'tag-1' }) },
    };
    const prisma = {
      tag: { findFirst: jest.fn().mockResolvedValue({ id: 'tag-1' }) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new TagsService(prisma as unknown as PrismaService);

    await service.deleteTag(user, 'tag-1');

    expect(transaction.todo.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['todo-1'] }, userId: user.id },
      data: { version: { increment: 1 } },
    });
  });
});
