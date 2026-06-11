import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReminderEventsController } from './reminder-events.controller';
import { ReminderEventsService } from './reminder-events.service';

@Module({
  imports: [AuthModule],
  controllers: [ReminderEventsController],
  providers: [ReminderEventsService],
})
export class ReminderEventsModule {}
