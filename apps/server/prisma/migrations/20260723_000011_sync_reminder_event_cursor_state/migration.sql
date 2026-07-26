-- The first updated_at migration preserved created_at for existing rows.
-- Publish their current status once so clients with an existing cursor do not
-- permanently miss state changes that predate the timestamp column.
UPDATE "reminder_events"
SET "updated_at" = CURRENT_TIMESTAMP;

DROP INDEX "reminder_events_user_id_updated_at_idx";

CREATE INDEX "reminder_events_user_id_updated_at_id_idx"
ON "reminder_events"("user_id", "updated_at" ASC, "id" ASC);
