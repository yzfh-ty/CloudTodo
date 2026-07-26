import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_SESSION_KEY = 'allowPasswordChangeSession';

export const AllowPasswordChangeSession = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_SESSION_KEY, true);
