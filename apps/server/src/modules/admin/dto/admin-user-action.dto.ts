import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminUserActionDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  reason?: string;
}
