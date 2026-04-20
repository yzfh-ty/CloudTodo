import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateNotificationEndpointDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  name?: string;

  @IsUrl({
    require_protocol: true,
  })
  @IsOptional()
  target_url?: string;

  @IsString()
  @IsOptional()
  secret?: string | null;

  @IsString()
  @IsOptional()
  payload_template?: string | null;

  @IsBoolean()
  @IsOptional()
  is_enabled?: boolean;
}
