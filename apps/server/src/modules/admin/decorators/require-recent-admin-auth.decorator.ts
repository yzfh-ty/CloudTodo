import { SetMetadata } from '@nestjs/common';

export const REQUIRE_RECENT_ADMIN_AUTH_KEY = 'requireRecentAdminAuth';

/** Require a freshly issued admin session for destructive/high-impact actions. */
export const RequireRecentAdminAuth = (maxAgeSeconds = 15 * 60) =>
  SetMetadata(REQUIRE_RECENT_ADMIN_AUTH_KEY, maxAgeSeconds);
