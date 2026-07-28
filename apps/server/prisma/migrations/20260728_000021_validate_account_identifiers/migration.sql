-- Login routes email-shaped identifiers exclusively to the email column.
-- Refuse to deploy that rule over ambiguous history: automatically renaming
-- an account could silently hand the identifier to a different user.
DO $migration$
DECLARE
  email_shaped_usernames BIGINT;
  cross_field_conflicts BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO email_shaped_usernames
  FROM "users"
  WHERE POSITION('@' IN "username") > 0;

  SELECT COUNT(*)
  INTO cross_field_conflicts
  FROM "users" AS email_owner
  JOIN "users" AS username_owner
    ON LOWER(email_owner."email") = LOWER(username_owner."username")
   AND email_owner."id" <> username_owner."id";

  IF email_shaped_usernames > 0 OR cross_field_conflicts > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'CloudTodo account identifier precondition failed',
      DETAIL = FORMAT(
        'email-shaped usernames: %s; cross-field conflicts: %s',
        email_shaped_usernames,
        cross_field_conflicts
      ),
      HINT = 'Rename each conflicting username to a unique value without @, then rerun the migration.';
  END IF;
END;
$migration$;

ALTER TABLE "users"
ADD CONSTRAINT "users_username_not_email_shaped"
CHECK (POSITION('@' IN "username") = 0);
