import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_SYNC_CURSOR_LENGTH,
  MAX_SYNC_PAGE_SIZE,
} from '../sync-cursor.util';

export class SyncChangesQueryDto {
  @IsString()
  @MaxLength(MAX_SYNC_CURSOR_LENGTH)
  @IsOptional()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SYNC_PAGE_SIZE)
  page_size?: number;
}
