import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotContains,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @NotContains('@')
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  nickname?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  timezone?: string;
}
