import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TodoListsController } from './todo-lists.controller';
import { TodoListsService } from './todo-lists.service';

@Module({
  imports: [AuthModule],
  controllers: [TodoListsController],
  providers: [TodoListsService],
})
export class TodoListsModule {}
