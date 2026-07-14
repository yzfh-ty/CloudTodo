import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TodoPriority, TodoStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { TodoListQueryDto } from './dto/todo-list-query.dto';
import { UpdateTodoTagsDto } from './dto/update-todo-tags.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(user: AuthenticatedUser) {
    const grouped = await this.prisma.todo.groupBy({
      by: ['status'],
      where: {
        userId: user.id,
        deletedAt: null,
        status: {
          in: [TodoStatus.pending, TodoStatus.completed, TodoStatus.archived],
        },
      },
      _count: {
        _all: true,
      },
    });
    const summary = {
      total: 0,
      pending: 0,
      completed: 0,
      archived: 0,
    };

    for (const item of grouped) {
      const count = item._count._all;
      if (item.status === TodoStatus.pending) summary.pending = count;
      if (item.status === TodoStatus.completed) summary.completed = count;
      if (item.status === TodoStatus.archived) summary.archived = count;
      summary.total += count;
    }

    return {
      code: 'OK',
      message: 'success',
      data: summary,
    };
  }

  async getTodos(user: AuthenticatedUser, query: TodoListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.TodoWhereInput = {
      userId: user.id,
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.keyword?.trim()) {
      where.OR = [
        { title: { contains: query.keyword.trim(), mode: 'insensitive' } },
        { description: { contains: query.keyword.trim(), mode: 'insensitive' } },
      ];
    }

    if (query.due_start || query.due_end) {
      where.dueAt = {
        ...(query.due_start ? { gte: new Date(query.due_start) } : {}),
        ...(query.due_end ? { lte: new Date(query.due_end) } : {}),
      };
    }

    if (query.updated_after) {
      where.updatedAt = {
        gt: new Date(query.updated_after),
      };
    }

    if (query.tag_id) {
      where.tags = {
        some: {
          tagId: query.tag_id,
        },
      };
    }

    if (query.list_id) {
      where.listId = query.list_id;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.todo.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
        select: this.todoSelect(),
      }),
      this.prisma.todo.count({ where }),
    ]);

    return {
      code: 'OK',
      message: 'success',
      data: {
        items,
        page,
        page_size: pageSize,
        total,
        has_more: skip + items.length < total,
      },
    };
  }

  async createTodo(user: AuthenticatedUser, dto: CreateTodoDto) {
    const listId = dto.list_id?.trim();
    if (listId) {
      await this.ensureListBelongsToUser(listId, user.id);
    }
    const tagIds = this.normalizeTagIds(dto.tag_ids);
    if (tagIds.length > 0) {
      await this.ensureTagsBelongToUser(tagIds, user.id);
    }

    const todo = await this.prisma.$transaction(async (tx) => {
      const created = await tx.todo.create({
        data: {
          userId: user.id,
          listId: listId ?? null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          status: TodoStatus.pending,
          priority: dto.priority ?? TodoPriority.medium,
          dueAt: dto.due_at ? new Date(dto.due_at) : null,
          isAllDay: dto.is_all_day ?? false,
          sourcePlatform: dto.source_platform ?? null,
        },
        select: { id: true },
      });

      await this.replaceTodoTagsTx(tx, created.id, tagIds);

      return tx.todo.findUniqueOrThrow({
        where: { id: created.id },
        select: this.todoSelect(),
      });
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async getTodo(user: AuthenticatedUser, id: string) {
    const todo = await this.findTodoOrThrow(user.id, id);
    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async updateTodo(user: AuthenticatedUser, id: string, dto: UpdateTodoDto) {
    await this.findTodoOrThrow(user.id, id);

    const listId = typeof dto.list_id === 'string' ? dto.list_id.trim() : dto.list_id;
    if (typeof listId === 'string' && listId.length > 0) {
      await this.ensureListBelongsToUser(listId, user.id);
    }

    const data: Prisma.TodoUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.due_at !== undefined) data.dueAt = dto.due_at ? new Date(dto.due_at) : null;
    if (dto.is_all_day !== undefined) data.isAllDay = dto.is_all_day;
    if (dto.list_id !== undefined) {
      data.list = listId
        ? {
            connect: { id: listId },
          }
        : {
            disconnect: true,
          };
    }
    if (dto.status !== undefined) data.status = dto.status;

    const tagIds = dto.tag_ids === undefined ? undefined : this.normalizeTagIds(dto.tag_ids);
    if (tagIds && tagIds.length > 0) {
      await this.ensureTagsBelongToUser(tagIds, user.id);
    }

    if (Object.keys(data).length === 0 && tagIds === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no todo fields to update',
      });
    }

    const todo = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.todo.update({
          where: { id },
          data,
          select: { id: true },
        });
      }

      if (tagIds !== undefined) {
        await this.replaceTodoTagsTx(tx, id, tagIds, Object.keys(data).length === 0);
      }

      return tx.todo.findUniqueOrThrow({
        where: { id },
        select: this.todoSelect(),
      });
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async deleteTodo(user: AuthenticatedUser, id: string) {
    await this.findTodoOrThrow(user.id, id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        status: TodoStatus.deleted,
        deletedAt: new Date(),
      },
      select: this.todoSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async completeTodo(user: AuthenticatedUser, id: string) {
    await this.findTodoOrThrow(user.id, id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        status: TodoStatus.completed,
        completedAt: new Date(),
      },
      select: this.todoSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async reopenTodo(user: AuthenticatedUser, id: string) {
    await this.findTodoOrThrow(user.id, id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        status: TodoStatus.pending,
        completedAt: null,
        archivedAt: null,
      },
      select: this.todoSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async archiveTodo(user: AuthenticatedUser, id: string) {
    await this.findTodoOrThrow(user.id, id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        status: TodoStatus.archived,
        archivedAt: new Date(),
      },
      select: this.todoSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  async setTodoTags(user: AuthenticatedUser, id: string, dto: UpdateTodoTagsDto) {
    await this.findTodoOrThrow(user.id, id);
    const tagIds = this.normalizeTagIds(dto.tag_ids);
    if (tagIds.length > 0) {
      await this.ensureTagsBelongToUser(tagIds, user.id);
    }

    const todo = await this.prisma.$transaction(async (tx) => {
      await this.replaceTodoTagsTx(tx, id, tagIds, true);
      return tx.todo.findUniqueOrThrow({
        where: { id },
        select: this.todoSelect(),
      });
    });

    return {
      code: 'OK',
      message: 'success',
      data: todo,
    };
  }

  private async ensureListBelongsToUser(listId: string, userId: string) {
    const list = await this.prisma.todoList.findFirst({
      where: {
        id: listId,
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!list) {
      throw new NotFoundException({
        code: 'TODO_LIST_NOT_FOUND',
        message: 'todo list not found',
      });
    }
  }

  private async ensureTagsBelongToUser(tagIds: string[], userId: string) {
    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: tagIds },
        userId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (tags.length !== tagIds.length) {
      throw new NotFoundException({
        code: 'TAG_NOT_FOUND',
        message: 'one or more tags were not found',
      });
    }
  }

  private async findTodoOrThrow(userId: string, id: string) {
    const todo = await this.prisma.todo.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      select: this.todoSelect(),
    });

    if (!todo) {
      throw new NotFoundException({
        code: 'TODO_NOT_FOUND',
        message: 'todo not found',
      });
    }

    return todo;
  }

  private todoSelect() {
    return {
      id: true,
      userId: true,
      listId: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      dueAt: true,
      isAllDay: true,
      sourcePlatform: true,
      completedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      tags: {
        select: {
          tagId: true,
          tag: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      },
    } satisfies Prisma.TodoSelect;
  }

  private normalizeTagIds(tagIds?: string[]) {
    return [...new Set((tagIds ?? []).map((tagId) => tagId.trim()).filter(Boolean))];
  }

  private async replaceTodoTagsTx(
    tx: Prisma.TransactionClient,
    todoId: string,
    tagIds: string[],
    touchTodo = false,
  ) {
    await tx.todoTag.deleteMany({
      where: { todoId },
    });

    if (tagIds.length > 0) {
      await tx.todoTag.createMany({
        data: tagIds.map((tagId) => ({
          todoId,
          tagId,
        })),
        skipDuplicates: true,
      });
    }

    if (touchTodo) {
      await tx.todo.update({
        where: { id: todoId },
        data: {
          version: {
            increment: 1,
          },
        },
        select: { id: true },
      });
    }
  }
}
