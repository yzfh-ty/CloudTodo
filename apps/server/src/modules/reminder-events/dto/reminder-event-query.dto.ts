import { Type } from 'class-transformer';
import { ReminderChannel, ReminderEventStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ReminderEventQueryDto {
  @IsEnum(ReminderEventStatus)
  @IsOptional()
  status?: ReminderEventStatus;

  @IsEnum(ReminderChannel)
  @IsOptional()
  channel?: ReminderChannel;

  @IsDateString()
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  @IsOptional()
  page_size?: number;
}
