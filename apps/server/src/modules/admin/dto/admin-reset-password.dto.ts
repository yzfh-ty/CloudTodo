import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum AdminResetPasswordMode {
  TEMPORARY_PASSWORD = 'temporary_password',
  RESET_TOKEN = 'reset_token',
}

export class AdminResetPasswordDto {
  @IsEnum(AdminResetPasswordMode)
  mode!: AdminResetPasswordMode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}
