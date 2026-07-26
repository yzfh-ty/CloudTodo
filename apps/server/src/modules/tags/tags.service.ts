import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTags(user: AuthenticatedUser) {
    const items = await this.prisma.tag.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      orderBy: [{ name: 'asc' }],
      select: this.tagSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: { items },
    };
  }

  async createTag(user: AuthenticatedUser, dto: CreateTagDto) {
    const name = dto.name.trim();
    const color = dto.color?.trim() || null;
    const existing = await this.prisma.tag.findUnique({
      where: {
        userId_name: {
          userId: user.id,
          name,
        },
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (existing && !existing.deletedAt) {
      throw new BadRequestException({
        code: 'TAG_ALREADY_EXISTS',
        message: 'tag name is already in use',
      });
    }

    const tag = existing
      ? await this.prisma.tag.update({
          where: { id: existing.id },
          data: {
            color,
            deletedAt: null,
          },
          select: this.tagSelect(),
        })
      : await this.prisma.tag.create({
          data: {
            userId: user.id,
            name,
            color,
          },
          select: this.tagSelect(),
        });

    return {
      code: 'OK',
      message: 'success',
      data: tag,
    };
  }

  async getTag(user: AuthenticatedUser, id: string) {
    const tag = await this.findTagOrThrow(user.id, id);
    return {
      code: 'OK',
      message: 'success',
      data: tag,
    };
  }

  async updateTag(user: AuthenticatedUser, id: string, dto: UpdateTagDto) {
    await this.findTagOrThrow(user.id, id);
    const nextName = dto.name?.trim();
    const data: Prisma.TagUpdateInput = {};

    if (nextName) {
      const existing = await this.prisma.tag.findFirst({
        where: {
          userId: user.id,
          name: nextName,
          deletedAt: null,
          NOT: { id },
        },
        select: { id: true },
      });

      if (existing) {
        throw new BadRequestException({
          code: 'TAG_ALREADY_EXISTS',
          message: 'tag name is already in use',
        });
      }

      data.name = nextName;
    }

    if (dto.color !== undefined) data.color = dto.color?.trim() || null;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no tag fields to update',
      });
    }

    const tag = await this.prisma.tag.update({
      where: { id },
      data,
      select: this.tagSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: tag,
    };
  }

  async deleteTag(user: AuthenticatedUser, id: string) {
    await this.findTagOrThrow(user.id, id);
    const tag = await this.prisma.$transaction(async (tx) => {
      const affectedTodos = await tx.todoTag.findMany({
        where: {
          tagId: id,
          todo: { userId: user.id },
        },
        select: { todoId: true },
      });

      await tx.todoTag.deleteMany({
        where: { tagId: id },
      });

      if (affectedTodos.length > 0) {
        await tx.todo.updateMany({
          where: {
            id: { in: affectedTodos.map((item) => item.todoId) },
            userId: user.id,
          },
          data: {
            version: { increment: 1 },
          },
        });
      }

      return tx.tag.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: this.tagSelect(),
      });
    });

    return {
      code: 'OK',
      message: 'success',
      data: tag,
    };
  }

  private async findTagOrThrow(userId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      select: this.tagSelect(),
    });

    if (!tag) {
      throw new NotFoundException({
        code: 'TAG_NOT_FOUND',
        message: 'tag not found',
      });
    }

    return tag;
  }

  private tagSelect() {
    return {
      id: true,
      userId: true,
      name: true,
      color: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.TagSelect;
  }
}
