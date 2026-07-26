import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MFA_CONFIRMATION_KEY = 'requireMfaConfirmation';

/**
 * Require a fresh TOTP or recovery code (X-CloudTodo-MFA-Code header) for
 * this request when the acting admin has MFA enrolled. Admins without MFA
 * fall back to the RequireRecentAdminAuth protection on the same route.
 */
export const RequireMfaConfirmation = () =>
  SetMetadata(REQUIRE_MFA_CONFIRMATION_KEY, true);
