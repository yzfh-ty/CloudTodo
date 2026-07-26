-- Track the last accepted TOTP time step so a code can never be accepted
-- twice, even inside the +/-1 step clock-drift window (RFC 6238 section 5.2).
ALTER TABLE "users" ADD COLUMN "totp_last_used_step" BIGINT;
