import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationEndpointsController } from './notification-endpoints.controller';
import { NotificationEndpointsService } from './notification-endpoints.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationEndpointsController],
  providers: [NotificationEndpointsService],
})
export class NotificationEndpointsModule {}
