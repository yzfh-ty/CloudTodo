import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateTodoTagsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  tag_ids!: string[];
}
