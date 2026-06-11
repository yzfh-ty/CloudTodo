import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { CreateTodoListDto } from './dto/create-todo-list.dto';
import { UpdateTodoListDto } from './dto/update-todo-list.dto';
import { TodoListsService } from './todo-lists.service';

@Controller('todo-lists')
@UseGuards(UserApiSessionGuard)
export class TodoListsController {
  constructor(private readonly todoListsService: TodoListsService) {}

  @Get()
  getTodoLists(@CurrentUser() user: AuthenticatedUser) {
    return this.todoListsService.getTodoLists(user);
  }

  @Post()
  createTodoList(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTodoListDto) {
    return this.todoListsService.createTodoList(user, dto);
  }

  @Get(':id')
  getTodoList(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todoListsService.getTodoList(user, id);
  }

  @Patch(':id')
  updateTodoList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTodoListDto,
  ) {
    return this.todoListsService.updateTodoList(user, id, dto);
  }

  @Delete(':id')
  deleteTodoList(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todoListsService.deleteTodoList(user, id);
  }
}
