-- Direct user-owned collections use the same leading columns as the
-- incremental sync predicate and keyset ordering.
CREATE INDEX "devices_user_id_updated_at_id_idx"
ON "devices"("user_id", "updated_at" ASC, "id" ASC);

CREATE INDEX "todo_lists_user_id_updated_at_id_idx"
ON "todo_lists"("user_id", "updated_at" ASC, "id" ASC);

CREATE INDEX "tags_user_id_updated_at_id_idx"
ON "tags"("user_id", "updated_at" ASC, "id" ASC);

CREATE INDEX "todos_user_id_updated_at_id_idx"
ON "todos"("user_id", "updated_at" ASC, "id" ASC);

CREATE INDEX "reminders_user_id_updated_at_id_idx"
ON "reminders"("user_id", "updated_at" ASC, "id" ASC);

CREATE INDEX "notification_endpoints_user_id_updated_at_id_idx"
ON "notification_endpoints"("user_id", "updated_at" ASC, "id" ASC);

-- Deliveries are user-scoped through reminder_events. Extending the existing
-- relation index lets PostgreSQL apply each event's timestamp/id window before
-- the final merge sort without scanning unrelated users' delivery history.
DROP INDEX "notification_deliveries_reminder_event_id_idx";
CREATE INDEX "notification_deliveries_reminder_event_id_updated_at_id_idx"
ON "notification_deliveries"("reminder_event_id", "updated_at" ASC, "id" ASC);
