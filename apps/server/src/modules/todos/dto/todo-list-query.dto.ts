import { Type } from 'class-transformer';
import { TodoStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TodoListQueryDto {
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  tag_id?: string;

  @IsOptional()
  @IsDateString()
  due_start?: string;

  @IsOptional()
  @IsDateString()
  due_end?: string;

  @IsOptional()
  @IsDateString()
  updated_after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number;
}
