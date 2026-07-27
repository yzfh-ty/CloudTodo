-- Repairs the tamper-evident audit chain shipped in 20260727_000017.
--
-- Three defects made it unverifiable in practice:
--   1. Audit foreign keys rewrote (SET NULL) or deleted (CASCADE) rows that had
--      already been hashed, so any user deletion broke the chain — and deleting
--      an administrator erased that administrator's operation log.
--   2. chain_seq comes from a sequence, which skips values on rolled-back
--      transactions, so it cannot be used to prove continuity.
--   3. There was no anchor for the newest entry, so rows deleted off the end
--      left a shorter chain that still verified.
--
-- Existing rows keep their columns untouched. They get no chain_index, which
-- marks them as pre-chain: verification skips them instead of reporting a
-- permanent failure for history that was never verifiable.

-- 1. Audit rows must outlive their subjects. Dropping the constraints (rather
--    than switching to RESTRICT) keeps user deletion possible while making the
--    stored actor/target ids immutable historical values.
ALTER TABLE "security_audit_logs" DROP CONSTRAINT IF EXISTS "security_audit_logs_actor_user_id_fkey";
ALTER TABLE "security_audit_logs" DROP CONSTRAINT IF EXISTS "security_audit_logs_target_user_id_fkey";
ALTER TABLE "admin_operation_logs" DROP CONSTRAINT IF EXISTS "admin_operation_logs_admin_user_id_fkey";
ALTER TABLE "admin_operation_logs" DROP CONSTRAINT IF EXISTS "admin_operation_logs_target_user_id_fkey";

-- 2. Gapless chain position, assigned by the writer under the existing
--    advisory lock and covered by the entry hash.
ALTER TABLE "security_audit_logs" ADD COLUMN IF NOT EXISTS "chain_index" BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS "security_audit_logs_chain_index_key"
  ON "security_audit_logs"("chain_index");

-- 3. Head anchor for tail-truncation detection.
CREATE TABLE IF NOT EXISTS "security_audit_chain_heads" (
    "id" INTEGER NOT NULL,
    "chain_index" BIGINT NOT NULL,
    "entry_hash" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "security_audit_chain_heads_pkey" PRIMARY KEY ("id")
);
