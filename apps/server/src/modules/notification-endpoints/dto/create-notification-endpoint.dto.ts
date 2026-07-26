import { NotificationEndpointType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateNotificationEndpointDto {
  @IsEnum(NotificationEndpointType)
  @IsOptional()
  type?: NotificationEndpointType;

  @IsString()
  @MaxLength(64)
  name!: string;

  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(1024)
  target_url!: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  secret?: string;

  @IsString()
  @MaxLength(10000)
  @IsOptional()
  payload_template?: string;

  @IsBoolean()
  @IsOptional()
  is_enabled?: boolean;
}
