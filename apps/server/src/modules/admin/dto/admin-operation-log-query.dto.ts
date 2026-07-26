import { Type } from 'class-transformer';
import { AdminOperationAction, AdminOperationResult } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AdminOperationLogQueryDto {
  @IsOptional()
  @IsUUID()
  admin_user_id?: string;

  @IsOptional()
  @IsUUID()
  target_user_id?: string;

  @IsOptional()
  @IsEnum(AdminOperationAction)
  action?: AdminOperationAction;

  @IsOptional()
  @IsEnum(AdminOperationResult)
  result?: AdminOperationResult;

  @IsOptional()
  @IsDateString()
  start?: string;

  @IsOptional()
  @IsDateString()
  end?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}
