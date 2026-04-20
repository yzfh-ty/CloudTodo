import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;
}
