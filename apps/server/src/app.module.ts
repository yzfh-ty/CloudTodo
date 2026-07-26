import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './common/config/app.config';
import { PrismaModule } from './common/database/prisma.module';
import { SecurityModule } from './common/security/security.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminPanelModule } from './modules/admin-panel/admin-panel.module';
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationEndpointsModule } from './modules/notification-endpoints/notification-endpoints.module';
import { ReminderEventsModule } from './modules/reminder-events/reminder-events.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SyncModule } from './modules/sync/sync.module';
import { TagsModule } from './modules/tags/tags.module';
import { TodoListsModule } from './modules/todo-lists/todo-lists.module';
import { TodosModule } from './modules/todos/todos.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      load: [appConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    SecurityModule,
    HealthModule,
    AuthModule,
    AdminPanelModule,
    AdminModule,
    UsersModule,
    DevicesModule,
    TodoListsModule,
    TagsModule,
    TodosModule,
    RemindersModule,
    ReminderEventsModule,
    NotificationEndpointsModule,
    SyncModule,
    SchedulerModule,
  ],
})
export class AppModule {}
