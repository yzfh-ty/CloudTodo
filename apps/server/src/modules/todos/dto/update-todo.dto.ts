import { TodoPriority, TodoStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTodoDto {
  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TodoPriority)
  @IsOptional()
  priority?: TodoPriority;

  @IsDateString()
  @IsOptional()
  due_at?: string;

  @IsBoolean()
  @IsOptional()
  is_all_day?: boolean;

  @IsString()
  @IsOptional()
  list_id?: string | null;

  @IsEnum(TodoStatus)
  @IsOptional()
  status?: TodoStatus;
}
