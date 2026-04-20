import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserApiSessionGuard } from './guards/user-api-session.guard';
import { UserSessionService } from './user-session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, UserSessionService, UserApiSessionGuard],
  exports: [AuthService, UserSessionService, UserApiSessionGuard],
})
export class AuthModule {}
