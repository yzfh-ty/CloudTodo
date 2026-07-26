import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  account!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** 6-digit TOTP code or a recovery code; required once MFA is enabled. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  totp_code?: string;
}
