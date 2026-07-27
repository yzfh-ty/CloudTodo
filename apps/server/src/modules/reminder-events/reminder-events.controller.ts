import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { ReminderEventQueryDto } from './dto/reminder-event-query.dto';
import { ReminderEventsService } from './reminder-events.service';

@Controller('reminder-events')
@UseGuards(UserApiSessionGuard)
export class ReminderEventsController {
  constructor(private readonly reminderEventsService: ReminderEventsService) {}

  @Get()
  getReminderEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReminderEventQueryDto,
  ) {
    return this.reminderEventsService.getReminderEvents(user, query);
  }

  @Get(':id')
  getReminderEvent(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reminderEventsService.getReminderEvent(user, id);
  }

  @Post(':id/ack')
  ackReminderEvent(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reminderEventsService.ackReminderEvent(user, id);
  }
}
