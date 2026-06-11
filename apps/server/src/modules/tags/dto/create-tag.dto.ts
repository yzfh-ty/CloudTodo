import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MaxLength(32)
  name!: string;

  @IsString()
  @MaxLength(16)
  @IsOptional()
  color?: string;
}
