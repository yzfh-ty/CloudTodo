import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(user: AuthenticatedUser, dto: RegisterDeviceDto) {
    const now = new Date();
    const deviceIdentifier = dto.device_identifier?.trim() || null;
    const existing = deviceIdentifier
      ? await this.prisma.device.findFirst({
          where: {
            userId: user.id,
            deviceIdentifier,
            deletedAt: null,
          },
          select: { id: true },
        })
      : null;

    const data = {
      platform: dto.platform,
      deviceName: dto.device_name.trim(),
      deviceIdentifier,
      appVersion: dto.app_version?.trim() || null,
      pushToken: dto.push_token?.trim() || null,
      lastActiveAt: now,
      isOnline: true,
      deletedAt: null,
    } satisfies Prisma.DeviceUpdateInput;

    const device = existing
      ? await this.prisma.device.update({
          where: { id: existing.id },
          data,
          select: this.deviceSelect(),
        })
      : await this.prisma.device.create({
          data: {
            userId: user.id,
            ...data,
          },
          select: this.deviceSelect(),
        });

    return {
      code: 'OK',
      message: 'success',
      data: device,
    };
  }

  async heartbeat(user: AuthenticatedUser, dto: DeviceHeartbeatDto) {
    const device = await this.findDevice(user.id, dto);
    const updated = await this.prisma.device.update({
      where: { id: device.id },
      data: {
        ...(dto.app_version !== undefined
          ? { appVersion: dto.app_version?.trim() || null }
          : {}),
        ...(dto.push_token !== undefined
          ? { pushToken: dto.push_token?.trim() || null }
          : {}),
        lastActiveAt: new Date(),
        isOnline: true,
      },
      select: this.deviceSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: updated,
    };
  }

  async listMyDevices(user: AuthenticatedUser) {
    const items = await this.prisma.device.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      orderBy: {
        lastActiveAt: 'desc',
      },
      select: this.deviceSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: { items },
    };
  }

  async deleteDevice(user: AuthenticatedUser, id: string) {
    const device = await this.prisma.device.findFirst({
      where: {
        id,
        userId: user.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'device not found',
      });
    }

    const deleted = await this.prisma.device.update({
      where: { id },
      data: {
        isOnline: false,
        deletedAt: new Date(),
      },
      select: this.deviceSelect(),
    });

    return {
      code: 'OK',
      message: 'success',
      data: deleted,
    };
  }

  private async findDevice(userId: string, dto: DeviceHeartbeatDto) {
    if (!dto.device_id && !dto.device_identifier?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'device_id or device_identifier is required',
      });
    }

    const device = await this.prisma.device.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          ...(dto.device_id ? [{ id: dto.device_id }] : []),
          ...(dto.device_identifier?.trim()
            ? [{ deviceIdentifier: dto.device_identifier.trim() }]
            : []),
        ],
      },
      select: { id: true },
    });

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'device not found',
      });
    }

    return device;
  }

  private deviceSelect() {
    return {
      id: true,
      userId: true,
      platform: true,
      deviceName: true,
      appVersion: true,
      lastActiveAt: true,
      isOnline: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    } satisfies Prisma.DeviceSelect;
  }
}
