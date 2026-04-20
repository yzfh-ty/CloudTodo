import { ReminderChannel, ReminderRepeatType, ReminderStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateReminderDto {
  @IsEnum(ReminderChannel)
  @IsOptional()
  channel?: ReminderChannel;

  @IsDateString()
  @IsOptional()
  remind_at?: string;

  @IsEnum(ReminderRepeatType)
  @IsOptional()
  repeat_type?: ReminderRepeatType;

  @IsObject()
  @IsOptional()
  repeat_rule?: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  timezone?: string | null;

  @IsEnum(ReminderStatus)
  @IsOptional()
  status?: ReminderStatus;
}
