-- Admin actions that change another account's access were only visible in
-- AdminOperationLog; mirror them into the security audit stream (SEC-M09).
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_user_created';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_user_disabled';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_user_enabled';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_password_reset_issued';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_logout_all_sessions';
