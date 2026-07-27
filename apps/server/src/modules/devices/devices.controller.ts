import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { DevicesService } from './devices.service';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Controller('devices')
@UseGuards(UserApiSessionGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  listMyDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.devicesService.listMyDevices(user);
  }

  @Post('register')
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.registerDevice(user, dto);
  }

  @Post('heartbeat')
  heartbeat(@CurrentUser() user: AuthenticatedUser, @Body() dto: DeviceHeartbeatDto) {
    return this.devicesService.heartbeat(user, dto);
  }

  @Delete(':id')
  deleteDevice(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.devicesService.deleteDevice(user, id);
  }
}
