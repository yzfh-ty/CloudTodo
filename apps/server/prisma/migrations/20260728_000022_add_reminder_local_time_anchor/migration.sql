ALTER TABLE "reminders"
ADD COLUMN "repeat_local_time" VARCHAR(12);

UPDATE "reminders" AS reminder
SET "repeat_local_time" = TO_CHAR(
  reminder."remind_at" AT TIME ZONE CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_timezone_names
      WHERE "name" = reminder."timezone"
    ) THEN reminder."timezone"
    ELSE 'UTC'
  END,
  'HH24:MI:SS.MS'
);

ALTER TABLE "reminders"
ALTER COLUMN "repeat_local_time" SET NOT NULL;
