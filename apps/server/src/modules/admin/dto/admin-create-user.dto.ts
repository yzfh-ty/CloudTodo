import { UserRole, UserStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotContains,
} from 'class-validator';

export class AdminCreateUserDto {
  @IsString()
  @IsNotEmpty()
  @NotContains('@')
  @MaxLength(64)
  username!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  nickname?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  timezone?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}
