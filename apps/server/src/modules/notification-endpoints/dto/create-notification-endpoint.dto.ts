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
    require_protocol: true,
  })
  target_url!: string;

  @IsString()
  @IsOptional()
  secret?: string;

  @IsString()
  @IsOptional()
  payload_template?: string;

  @IsBoolean()
  @IsOptional()
  is_enabled?: boolean;
}
