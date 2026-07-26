-- Older worker versions persisted provider-controlled response and error text.
-- Remove it once so upgraded installations no longer retain those secrets.
UPDATE "notification_deliveries"
SET
    "response_body" = NULL,
    "last_error" = NULL
WHERE "response_body" IS NOT NULL OR "last_error" IS NOT NULL;

UPDATE "notification_endpoints"
SET "last_response_summary" = NULL
WHERE "last_response_summary" IS NOT NULL;
