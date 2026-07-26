ALTER TABLE "users"
  ADD COLUMN "totp_secret_encrypted" VARCHAR(512),
  ADD COLUMN "totp_pending_secret_encrypted" VARCHAR(512),
  ADD COLUMN "totp_enabled_at" TIMESTAMPTZ(6);

CREATE TABLE "mfa_recovery_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" VARCHAR(255) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key" ON "mfa_recovery_codes"("code_hash");

CREATE INDEX "mfa_recovery_codes_user_id_consumed_at_idx" ON "mfa_recovery_codes"("user_id", "consumed_at");

ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_mfa_enrolled';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_mfa_disabled';
ALTER TYPE "SecurityAuditAction" ADD VALUE IF NOT EXISTS 'admin_mfa_failure';
