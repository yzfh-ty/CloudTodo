import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { UpdateMeDto } from './dto/update-me.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
  ) {}

  async getMe(user: AuthenticatedUser) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        role: true,
        status: true,
        timezone: true,
        forcePasswordChange: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }

    return {
      code: 'OK',
      message: 'success',
      data: currentUser,
    };
  }

  async updateMe(user: AuthenticatedUser, dto: UpdateMeDto) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        nickname: true,
        timezone: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'user not found',
      });
    }

    const nextEmail = dto.email?.trim().toLowerCase();
    const nextNickname = dto.nickname?.trim();
    const nextTimezone = dto.timezone?.trim();
    const data: { email?: string; nickname?: string; timezone?: string } = {};

    if (nextEmail && nextEmail !== currentUser.email) {
      const emailExists = await this.prisma.user.findFirst({
        where: {
          email: nextEmail,
          NOT: { id: user.id },
        },
        select: { id: true },
      });

      if (emailExists) {
        void this.securityAuditService.record({
          action: 'user_profile_updated',
          result: 'failure',
          actorUserId: user.id,
          targetUserId: user.id,
          metadata: { reason: 'email_already_in_use' },
        });
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'email is already in use',
        });
      }

      data.email = nextEmail;
    }

    if (nextNickname && nextNickname !== currentUser.nickname) {
      data.nickname = nextNickname;
    }

    if (nextTimezone && nextTimezone !== currentUser.timezone) {
      data.timezone = nextTimezone;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'no user fields to update',
      });
    }

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: user.id },
        data,
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          role: true,
          status: true,
          timezone: true,
          forcePasswordChange: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (data.timezone !== undefined) {
        await transaction.reminder.updateMany({
          where: {
            userId: user.id,
            deletedAt: null,
          },
          data: {
            timezone: data.timezone,
          },
        });
      }

      return updated;
    });

    void this.securityAuditService.record({
      action: 'user_profile_updated',
      result: 'success',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: {
        fields: Object.keys(data).sort(),
        email_changed: data.email !== undefined,
      },
    });

    return {
      code: 'OK',
      message: 'success',
      data: updatedUser,
    };
  }
}
