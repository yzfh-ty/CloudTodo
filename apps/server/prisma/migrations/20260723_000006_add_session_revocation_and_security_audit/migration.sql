-- Add a server-side revocation marker so stateless access tokens can be
-- invalidated immediately on logout, password changes, and account actions.
ALTER TABLE "users"
ADD COLUMN "session_revoked_at" TIMESTAMPTZ(6);

CREATE TYPE "SecurityAuditAction" AS ENUM (
    'user_register',
    'user_login_success',
    'user_login_failure',
    'admin_login_success',
    'admin_login_failure',
    'user_refresh',
    'refresh_token_reuse',
    'user_logout',
    'admin_logout',
    'password_change',
    'admin_password_change',
    'password_reset_confirmed',
    'webhook_created',
    'webhook_updated',
    'webhook_deleted',
    'webhook_tested',
    'webhook_delivery_blocked',
    'webhook_delivery_succeeded',
    'webhook_delivery_failed'
);

CREATE TYPE "SecurityAuditResult" AS ENUM ('success', 'failure', 'blocked');

CREATE TABLE "security_audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "target_user_id" UUID,
    "action" "SecurityAuditAction" NOT NULL,
    "result" "SecurityAuditResult" NOT NULL,
    "ip_address" VARCHAR(64),
    "session_id" VARCHAR(128),
    "request_id" VARCHAR(128),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_audit_logs_actor_user_id_created_at_idx"
ON "security_audit_logs"("actor_user_id", "created_at" DESC);

CREATE INDEX "security_audit_logs_target_user_id_created_at_idx"
ON "security_audit_logs"("target_user_id", "created_at" DESC);

CREATE INDEX "security_audit_logs_action_created_at_idx"
ON "security_audit_logs"("action", "created_at" DESC);

ALTER TABLE "security_audit_logs"
ADD CONSTRAINT "security_audit_logs_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_audit_logs"
ADD CONSTRAINT "security_audit_logs_target_user_id_fkey"
FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
