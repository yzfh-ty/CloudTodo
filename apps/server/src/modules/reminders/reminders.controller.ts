import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller()
@UseGuards(UserApiSessionGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post('todos/:id/reminders')
  createReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateReminderDto,
  ) {
    return this.remindersService.createReminder(user, id, dto);
  }

  @Patch('reminders/:id')
  updateReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.updateReminder(user, id, dto);
  }

  @Delete('reminders/:id')
  deleteReminder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.remindersService.deleteReminder(user, id);
  }

  @Get('reminders/upcoming')
  getUpcomingReminders(@CurrentUser() user: AuthenticatedUser) {
    return this.remindersService.getUpcomingReminders(user);
  }
}
