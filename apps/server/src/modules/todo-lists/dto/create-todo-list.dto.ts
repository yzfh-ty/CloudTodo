import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTodoListDto {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsString()
  @MaxLength(16)
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  sort_order?: number;
}
