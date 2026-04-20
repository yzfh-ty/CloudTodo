import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminUpdateUserDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  nickname?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
