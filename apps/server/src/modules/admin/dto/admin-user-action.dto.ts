import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUserActionDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(255)
  reason?: string;
}
