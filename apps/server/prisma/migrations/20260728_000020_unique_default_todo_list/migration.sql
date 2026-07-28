WITH ranked_defaults AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id"
            ORDER BY "updated_at" DESC, "id" DESC
        ) AS default_rank
    FROM "todo_lists"
    WHERE "is_default" = TRUE AND "deleted_at" IS NULL
)
UPDATE "todo_lists" AS list
SET "is_default" = FALSE
FROM ranked_defaults AS ranked
WHERE list."id" = ranked."id" AND ranked.default_rank > 1;

CREATE UNIQUE INDEX "todo_lists_one_live_default_per_user_idx"
ON "todo_lists"("user_id")
WHERE "is_default" = TRUE AND "deleted_at" IS NULL;
