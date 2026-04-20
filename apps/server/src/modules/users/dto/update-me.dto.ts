import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateMeDto {
  @IsString()
  @IsOptional()
  nickname?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}
