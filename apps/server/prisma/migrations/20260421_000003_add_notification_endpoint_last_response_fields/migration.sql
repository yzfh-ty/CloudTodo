ALTER TABLE "notification_endpoints"
ADD COLUMN "last_response_code" INTEGER,
ADD COLUMN "last_response_summary" VARCHAR(255);
