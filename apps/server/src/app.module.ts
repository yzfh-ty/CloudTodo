import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './common/config/app.config';
import { PrismaModule } from './common/database/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminPanelModule } from './modules/admin-panel/admin-panel.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationEndpointsModule } from './modules/notification-endpoints/notification-endpoints.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { TodosModule } from './modules/todos/todos.module';
import { UsersModule } from './modules/users/users.module';
import { WebhookTestModule } from './modules/webhook-test/webhook-test.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      load: [appConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    AdminPanelModule,
    AdminModule,
    UsersModule,
    TodosModule,
    RemindersModule,
    NotificationEndpointsModule,
    SchedulerModule,
    WebhookTestModule,
  ],
})
export class AppModule {}
