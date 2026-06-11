import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTagDto {
  @IsString()
  @MaxLength(32)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(16)
  @IsOptional()
  color?: string | null;
}
