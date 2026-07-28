import { Type } from 'class-transformer';
import { ReminderChannel, ReminderEventStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReminderEventQueryDto {
  @IsEnum(ReminderEventStatus)
  @IsOptional()
  status?: ReminderEventStatus;

  @IsEnum(ReminderChannel)
  @IsOptional()
  channel?: ReminderChannel;

  @IsString()
  @MaxLength(2048)
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(200)
  @IsOptional()
  page_size?: number;
}
