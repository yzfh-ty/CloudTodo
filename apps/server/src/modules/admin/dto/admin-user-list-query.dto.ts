import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export class AdminUserListQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsDateString()
  created_start?: string;

  @IsOptional()
  @IsDateString()
  created_end?: string;

  @IsOptional()
  @IsDateString()
  last_login_start?: string;

  @IsOptional()
  @IsDateString()
  last_login_end?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}
