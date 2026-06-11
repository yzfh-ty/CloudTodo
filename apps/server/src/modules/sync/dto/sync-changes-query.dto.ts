import { IsDateString, IsOptional } from 'class-validator';

export class SyncChangesQueryDto {
  @IsDateString()
  @IsOptional()
  cursor?: string;
}
