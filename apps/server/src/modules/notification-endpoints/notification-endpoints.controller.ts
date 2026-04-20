import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import { CreateNotificationEndpointDto } from './dto/create-notification-endpoint.dto';
import { UpdateNotificationEndpointDto } from './dto/update-notification-endpoint.dto';
import { NotificationEndpointsService } from './notification-endpoints.service';

@Controller('notification-endpoints')
@UseGuards(UserApiSessionGuard)
export class NotificationEndpointsController {
  constructor(
    private readonly notificationEndpointsService: NotificationEndpointsService,
  ) {}

  @Get()
  getEndpoints(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationEndpointsService.getEndpoints(user);
  }

  @Post()
  createEndpoint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNotificationEndpointDto,
  ) {
    return this.notificationEndpointsService.createEndpoint(user, dto);
  }

  @Get(':id')
  getEndpoint(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationEndpointsService.getEndpoint(user, id);
  }

  @Patch(':id')
  updateEndpoint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateNotificationEndpointDto,
  ) {
    return this.notificationEndpointsService.updateEndpoint(user, id, dto);
  }

  @Delete(':id')
  deleteEndpoint(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationEndpointsService.deleteEndpoint(user, id);
  }

  @Post(':id/test')
  testEndpoint(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationEndpointsService.testEndpoint(user, id);
  }
}
