import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_SYNC_PAGE_SIZE } from '../sync-cursor.util';

export class SyncBootstrapQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SYNC_PAGE_SIZE)
  page_size?: number;

  @IsOptional()
  @IsDateString()
  snapshot_at?: string;
}
