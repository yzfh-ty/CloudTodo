import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';

@Injectable()
export class TodoListsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTodoLists(user: AuthenticatedUser) {
    const items = await this.prisma.todoList.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: this.todoListSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: { items },
    };
  }

  async createTodoList(user: AuthenticatedUser, dto: CreateTodoListDto) {
    const list = await this.withDefaultConflictRetry(Boolean(dto.is_default), () =>
      this.prisma.$transaction(async (tx) => {
        if (dto.is_default) {
          await tx.todoList.updateMany({
            where: {
              userId: user.id,
              deletedAt: null,
              isDefault: true,
            },
            data: { isDefault: false },
          });
        }

        return tx.todoList.create({
          data: {
            userId: user.id,
            name: dto.name.trim(),
            color: dto.color?.trim() || null,
            isDefault: dto.is_default ?? false,
            sortOrder: dto.sort_order ?? 0,
          },
          select: this.todoListSelect(),
        });
      }),
    );

    return {
      code: 'OK',
      message: 'success',
      data: list,
    };
  }

  async getTodoList(user: AuthenticatedUser, id: string) {
    const list = await this.findTodoListOrThrow(user.id, id);
    return {
      code: 'OK',
      message: 'success',
      data: list,
    };
  }

  async updateTodoList(user: AuthenticatedUser, id: string, dto: UpdateTodoListDto) {
    await this.findTodoListOrThrow(user.id, id);
    const data: Prisma.TodoListUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.color !== undefined) data.color = dto.color?.trim() || null;
    if (dto.is_default !== undefined) data.isDefault = dto.is_default;
    if (dto.sort_order !== undefined) data.sortOrder = dto.sort_order;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no todo list fields to update',
      });
    }

    const list = await this.withDefaultConflictRetry(Boolean(dto.is_default), () =>
      this.prisma.$transaction(async (tx) => {
        if (dto.is_default) {
          await tx.todoList.updateMany({
            where: {
              userId: user.id,
              deletedAt: null,
              isDefault: true,
              NOT: { id },
            },
            data: { isDefault: false },
          });
        }

        return tx.todoList.update({
          where: { id },
          data,
          select: this.todoListSelect(),
        });
      }),
    );

    return {
      code: 'OK',
      message: 'success',
      data: list,
    };
  }

  async deleteTodoList(user: AuthenticatedUser, id: string) {
    await this.findTodoListOrThrow(user.id, id);
    const deletedAt = new Date();
    const list = await this.prisma.$transaction(async (tx) => {
      await tx.todo.updateMany({
        where: {
          userId: user.id,
          listId: id,
          deletedAt: null,
        },
        data: { listId: null },
      });

      return tx.todoList.update({
        where: { id },
        data: {
          isDefault: false,
          deletedAt,
        },
        select: this.todoListSelect(),
      });
    });

    return {
      code: 'OK',
      message: 'success',
      data: list,
    };
  }

  private async findTodoListOrThrow(userId: string, id: string) {
    const list = await this.prisma.todoList.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      select: this.todoListSelect(),
    });

    if (!list) {
      throw new NotFoundException({
        code: 'TODO_LIST_NOT_FOUND',
        message: 'todo list not found',
      });
    }

    return list;
  }

  private async withDefaultConflictRetry<T>(
    makeDefault: boolean,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!makeDefault || !this.isUniqueConflict(error)) throw error;
    }

    try {
      return await operation();
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      throw new ConflictException({
        code: 'DEFAULT_TODO_LIST_CONFLICT',
        message: 'another default todo list was selected concurrently; retry the request',
      });
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }

  private todoListSelect() {
    return {
      id: true,
      userId: true,
      name: true,
      color: true,
      isDefault: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.TodoListSelect;
  }
}
