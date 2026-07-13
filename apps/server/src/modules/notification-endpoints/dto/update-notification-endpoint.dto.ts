import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateNotificationEndpointDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  name?: string;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
  })
  @MaxLength(1024)
  @IsOptional()
  target_url?: string;

  @IsString()
  @MaxLength(128)
  @IsOptional()
  secret?: string | null;

  @IsString()
  @MaxLength(10000)
  @IsOptional()
  payload_template?: string | null;

  @IsBoolean()
  @IsOptional()
  is_enabled?: boolean;
}
