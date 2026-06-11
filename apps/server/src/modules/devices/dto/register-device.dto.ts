import { PlatformType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsEnum(PlatformType)
  platform!: PlatformType;

  @IsString()
  @MaxLength(128)
  device_name!: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  device_identifier?: string;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  app_version?: string;

  @IsString()
  @MaxLength(512)
  @IsOptional()
  push_token?: string;
}
