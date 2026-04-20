import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum AdminResetPasswordMode {
  TEMPORARY_PASSWORD = 'temporary_password',
  RESET_TOKEN = 'reset_token',
}

export class AdminResetPasswordDto {
  @IsEnum(AdminResetPasswordMode)
  mode!: AdminResetPasswordMode;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
