import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, NotContains } from 'class-validator';

export class AdminUpdateUserDto {
  @IsString()
  @IsOptional()
  @NotContains('@')
  @MaxLength(64)
  username?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  nickname?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}
