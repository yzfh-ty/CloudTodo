import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagsService } from './tags.service';

@Controller('tags')
@UseGuards(UserApiSessionGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  getTags(@CurrentUser() user: AuthenticatedUser) {
    return this.tagsService.getTags(user);
  }

  @Post()
  createTag(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTagDto) {
    return this.tagsService.createTag(user, dto);
  }

  @Get(':id')
  getTag(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tagsService.getTag(user, id);
  }

  @Patch(':id')
  updateTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.updateTag(user, id, dto);
  }

  @Delete(':id')
  deleteTag(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tagsService.deleteTag(user, id);
  }
}
