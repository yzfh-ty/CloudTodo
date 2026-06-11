import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeviceHeartbeatDto {
  @IsString()
  @IsOptional()
  device_id?: string;

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
