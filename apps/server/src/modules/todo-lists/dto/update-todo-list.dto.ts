import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTodoListDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(16)
  @IsOptional()
  color?: string | null;

  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  sort_order?: number;
}
