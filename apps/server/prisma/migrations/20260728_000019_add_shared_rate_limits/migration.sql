CREATE TABLE "rate_limit_buckets" (
    "key_hash" CHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "reset_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key_hash")
);

CREATE INDEX "rate_limit_buckets_reset_at_idx"
ON "rate_limit_buckets"("reset_at");
