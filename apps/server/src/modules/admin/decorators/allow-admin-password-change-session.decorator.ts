import { SetMetadata } from '@nestjs/common';

export const ALLOW_ADMIN_PASSWORD_CHANGE_SESSION_KEY = 'allowAdminPasswordChangeSession';

export const AllowAdminPasswordChangeSession = () =>
  SetMetadata(ALLOW_ADMIN_PASSWORD_CHANGE_SESSION_KEY, true);
