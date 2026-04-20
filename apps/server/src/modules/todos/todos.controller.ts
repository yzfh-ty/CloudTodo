import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/user-session.service';
import { UserApiSessionGuard } from '../auth/guards/user-api-session.guard';
import { CreateTodoDto } from './dto/create-todo.dto';
import { TodoListQueryDto } from './dto/todo-list-query.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodosService } from './todos.service';

@Controller('todos')
@UseGuards(UserApiSessionGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  getTodos(@CurrentUser() user: AuthenticatedUser, @Query() query: TodoListQueryDto) {
    return this.todosService.getTodos(user, query);
  }

  @Post()
  createTodo(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTodoDto) {
    return this.todosService.createTodo(user, dto);
  }

  @Get(':id')
  getTodo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todosService.getTodo(user, id);
  }

  @Patch(':id')
  updateTodo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ) {
    return this.todosService.updateTodo(user, id, dto);
  }

  @Delete(':id')
  deleteTodo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todosService.deleteTodo(user, id);
  }

  @Post(':id/complete')
  completeTodo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todosService.completeTodo(user, id);
  }

  @Post(':id/reopen')
  reopenTodo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todosService.reopenTodo(user, id);
  }

  @Post(':id/archive')
  archiveTodo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.todosService.archiveTodo(user, id);
  }
}
