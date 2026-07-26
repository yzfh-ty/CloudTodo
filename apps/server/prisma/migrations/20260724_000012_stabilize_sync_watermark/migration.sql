-- Sync cursors use updated_at as a high watermark. A writer must publish its
-- timestamp only after it has crossed the same per-user transaction barrier
-- that readers use to establish a snapshot upper bound. Otherwise a row can
-- receive an old timestamp, commit after the snapshot query, and be skipped by
-- every later cursor window.

BEGIN;

CREATE FUNCTION "cloudtodo_sync_lock_key"(sync_user_id UUID)
RETURNS BIGINT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
STRICT
AS $function$
  SELECT hashtextextended('cloudtodo.sync.v1:' || sync_user_id::TEXT, 0);
$function$;

CREATE FUNCTION "cloudtodo_acquire_sync_snapshot"(sync_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
STRICT
AS $function$
BEGIN
  -- The exclusive transaction lock waits for older writes for this user and
  -- holds newer writes until the snapshot transaction has finished reading.
  PERFORM pg_advisory_xact_lock("cloudtodo_sync_lock_key"(sync_user_id));
  -- JavaScript Date and sync cursors have millisecond precision. Keeping the
  -- upper bound one millisecond behind the database clock prevents a writer
  -- that starts just after this transaction from receiving the same timestamp
  -- as the cursor that was just issued.
  RETURN date_trunc('milliseconds', clock_timestamp()) - INTERVAL '1 millisecond';
END;
$function$;

CREATE FUNCTION "cloudtodo_stamp_sync_user_row"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
AS $function$
DECLARE
  sync_user_id UUID;
  observed_at TIMESTAMPTZ;
BEGIN
  sync_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM pg_advisory_xact_lock_shared("cloudtodo_sync_lock_key"(sync_user_id));

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  observed_at := date_trunc('milliseconds', clock_timestamp());
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := observed_at;
    NEW.updated_at := observed_at;
  ELSE
    -- Ignore this write's application timestamp so a fast or slow node cannot
    -- put the row outside the database-clock snapshot. Migration-time
    -- normalization guarantees OLD is not a legacy far-future timestamp.
    NEW.updated_at := GREATEST(OLD.updated_at, observed_at);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION "cloudtodo_stamp_sync_delivery"()
RETURNS TRIGGER
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
AS $function$
DECLARE
  sync_user_id UUID;
  observed_at TIMESTAMPTZ;
BEGIN
  SELECT reminder_event.user_id
  INTO sync_user_id
  FROM "reminder_events" AS reminder_event
  WHERE reminder_event.id = CASE
    WHEN TG_OP = 'DELETE' THEN OLD.reminder_event_id
    ELSE NEW.reminder_event_id
  END;

  -- During a cascading event deletion the parent row may already be hidden
  -- from this transaction. The endpoint has the same validated owner.
  IF sync_user_id IS NULL THEN
    SELECT endpoint.user_id
    INTO sync_user_id
    FROM "notification_endpoints" AS endpoint
    WHERE endpoint.id = CASE
      WHEN TG_OP = 'DELETE' THEN OLD.endpoint_id
      ELSE NEW.endpoint_id
    END;
  END IF;

  IF sync_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock_shared("cloudtodo_sync_lock_key"(sync_user_id));
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  observed_at := date_trunc('milliseconds', clock_timestamp());
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := observed_at;
    NEW.updated_at := observed_at;
  ELSE
    NEW.updated_at := GREATEST(OLD.updated_at, observed_at);
  END IF;
  RETURN NEW;
END;
$function$;

-- Keep application writers out while legacy timestamps are normalized and
-- the write barriers are installed. Reads remain available during deployment.
LOCK TABLE
  "todo_lists",
  "tags",
  "todos",
  "todo_tags",
  "reminders",
  "reminder_events",
  "notification_endpoints",
  "notification_deliveries",
  "devices"
IN SHARE ROW EXCLUSIVE MODE;

-- Existing rows may contain application-clock future values or PostgreSQL
-- microseconds that cannot round-trip through JavaScript Date. Re-publish all
-- cursor rows at one database millisecond so existing clients receive a clean,
-- deterministic keyset window. Historical creation times are retained after
-- truncation, while future creation times are clamped to the migration instant.
DO $migration$
DECLARE
  normalized_at TIMESTAMPTZ := date_trunc('milliseconds', clock_timestamp());
BEGIN
  UPDATE "todo_lists"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "tags"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "todos"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "todo_tags"
  SET "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at);

  UPDATE "reminders"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "reminder_events"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "notification_endpoints"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "notification_deliveries"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;

  UPDATE "devices"
  SET
    "created_at" = LEAST(date_trunc('milliseconds', "created_at"), normalized_at),
    "updated_at" = normalized_at;
END;
$migration$;

CREATE TRIGGER "todo_lists_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "todo_lists"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

CREATE TRIGGER "tags_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "tags"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

CREATE TRIGGER "todos_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "todos"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

CREATE TRIGGER "reminders_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "reminders"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

CREATE TRIGGER "reminder_events_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "reminder_events"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

CREATE TRIGGER "notification_endpoints_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "notification_endpoints"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

CREATE TRIGGER "notification_deliveries_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "notification_deliveries"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_delivery"();

CREATE TRIGGER "devices_sync_watermark"
BEFORE INSERT OR UPDATE OR DELETE ON "devices"
FOR EACH ROW EXECUTE FUNCTION "cloudtodo_stamp_sync_user_row"();

COMMENT ON FUNCTION "cloudtodo_sync_lock_key"(UUID) IS
  'Derives the per-user advisory lock key shared by sync readers and writers.';
COMMENT ON FUNCTION "cloudtodo_acquire_sync_snapshot"(UUID) IS
  'Waits for older sync writes and returns a database-clock high watermark.';
COMMENT ON FUNCTION "cloudtodo_stamp_sync_user_row"() IS
  'Publishes monotonic sync timestamps after acquiring the user write barrier.';
COMMENT ON FUNCTION "cloudtodo_stamp_sync_delivery"() IS
  'Publishes delivery sync timestamps using the owning reminder event user.';

COMMIT;
