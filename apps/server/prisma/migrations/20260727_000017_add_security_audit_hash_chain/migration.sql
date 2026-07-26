-- Tamper-evident audit storage: every new entry links to its predecessor via
-- SHA-256. Rows written before this migration have no hashes; the chain
-- starts with the first entry recorded after deployment.
ALTER TABLE "security_audit_logs" ADD COLUMN "chain_seq" BIGSERIAL;
ALTER TABLE "security_audit_logs" ADD COLUMN "prev_hash" VARCHAR(64);
ALTER TABLE "security_audit_logs" ADD COLUMN "entry_hash" VARCHAR(64);

CREATE UNIQUE INDEX "security_audit_logs_chain_seq_key" ON "security_audit_logs"("chain_seq");
