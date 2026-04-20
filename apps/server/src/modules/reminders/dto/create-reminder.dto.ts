import { ReminderChannel, ReminderRepeatType } from '@prisma/client';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateReminderDto {
  @IsEnum(ReminderChannel)
  channel!: ReminderChannel;

  @IsDateString()
  remind_at!: string;

  @IsEnum(ReminderRepeatType)
  @IsOptional()
  repeat_type?: ReminderRepeatType;

  @IsObject()
  @IsOptional()
  repeat_rule?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  timezone?: string;
}
