ALTER TABLE "reminder_events"
ADD COLUMN "updated_at" TIMESTAMPTZ(6);

UPDATE "reminder_events"
SET "updated_at" = "created_at"
WHERE "updated_at" IS NULL;

ALTER TABLE "reminder_events"
ALTER COLUMN "updated_at" SET NOT NULL;

CREATE INDEX "reminder_events_user_id_updated_at_idx"
ON "reminder_events"("user_id", "updated_at" ASC);
