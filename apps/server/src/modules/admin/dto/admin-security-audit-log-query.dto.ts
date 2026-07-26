import { Type } from 'class-transformer';
import { SecurityAuditAction, SecurityAuditResult } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class AdminSecurityAuditLogQueryDto {
  @IsOptional()
  @IsUUID()
  actor_user_id?: string;

  @IsOptional()
  @IsUUID()
  target_user_id?: string;

  @IsOptional()
  @IsEnum(SecurityAuditAction)
  action?: SecurityAuditAction;

  @IsOptional()
  @IsEnum(SecurityAuditResult)
  result?: SecurityAuditResult;

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
