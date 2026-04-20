-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled', 'deleted');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('pending', 'completed', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "TodoPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('web', 'android', 'windows');

-- CreateEnum
CREATE TYPE "ReminderRepeatType" AS ENUM ('none', 'daily', 'weekly', 'workday', 'custom');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'triggered', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('android_local', 'windows_local', 'webhook');

-- CreateEnum
CREATE TYPE "ReminderEventStatus" AS ENUM ('pending', 'processing', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "NotificationEndpointType" AS ENUM ('webhook');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('pending', 'processing', 'success', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "PasswordResetMode" AS ENUM ('temporary_password', 'reset_token');

-- CreateEnum
CREATE TYPE "AdminOperationAction" AS ENUM ('disable_user', 'enable_user', 'reset_user_password', 'update_user_profile', 'change_admin_password', 'logout_all_sessions');

-- CreateEnum
CREATE TYPE "AdminOperationResult" AS ENUM ('success', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nickname" VARCHAR(64) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "avatar_url" VARCHAR(512),
    "last_login_at" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "force_password_change" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "token_hash" VARCHAR(255) NOT NULL,
    "mode" "PasswordResetMode" NOT NULL,
    "temporary_password_hash" VARCHAR(255),
    "reason" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "device_name" VARCHAR(128) NOT NULL,
    "device_identifier" VARCHAR(255),
    "app_version" VARCHAR(32),
    "push_token" VARCHAR(512),
    "last_active_at" TIMESTAMPTZ(6),
    "last_ip" VARCHAR(64),
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_lists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "color" VARCHAR(16),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "todo_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "color" VARCHAR(16),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "list_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "TodoStatus" NOT NULL,
    "priority" "TodoPriority" NOT NULL DEFAULT 'medium',
    "due_at" TIMESTAMPTZ(6),
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "source_platform" "PlatformType",
    "completed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_tags" (
    "todo_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_tags_pkey" PRIMARY KEY ("todo_id","tag_id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "todo_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "repeat_type" "ReminderRepeatType" NOT NULL DEFAULT 'none',
    "repeat_rule" JSONB,
    "remind_at" TIMESTAMPTZ(6) NOT NULL,
    "timezone" VARCHAR(64),
    "status" "ReminderStatus" NOT NULL DEFAULT 'pending',
    "last_triggered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_events" (
    "id" UUID NOT NULL,
    "reminder_id" UUID NOT NULL,
    "todo_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "triggered_at" TIMESTAMPTZ(6) NOT NULL,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "status" "ReminderEventStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_endpoints" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationEndpointType" NOT NULL DEFAULT 'webhook',
    "name" VARCHAR(64) NOT NULL,
    "target_url" VARCHAR(1024) NOT NULL,
    "secret" VARCHAR(255),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_success_at" TIMESTAMPTZ(6),
    "last_failure_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "reminder_event_id" UUID NOT NULL,
    "endpoint_id" UUID NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6),
    "response_code" INTEGER,
    "response_body" TEXT,
    "last_error" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_operation_logs" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" "AdminOperationAction" NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "metadata" JSONB,
    "result" "AdminOperationResult" NOT NULL,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_status_created_at_idx" ON "users"("role", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "users_status_last_login_at_idx" ON "users"("status", "last_login_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "auth_refresh_tokens_token_hash_key" ON "auth_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_refresh_tokens_user_id_revoked_at_expires_at_idx" ON "auth_refresh_tokens"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "auth_refresh_tokens_device_id_revoked_at_idx" ON "auth_refresh_tokens"("device_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_password_reset_tokens_token_hash_key" ON "auth_password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_password_reset_tokens_user_id_expires_at_idx" ON "auth_password_reset_tokens"("user_id", "expires_at" DESC);

-- CreateIndex
CREATE INDEX "auth_password_reset_tokens_created_by_user_id_created_at_idx" ON "auth_password_reset_tokens"("created_by_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "devices_user_id_platform_last_active_at_idx" ON "devices"("user_id", "platform", "last_active_at" DESC);

-- CreateIndex
CREATE INDEX "devices_device_identifier_idx" ON "devices"("device_identifier");

-- CreateIndex
CREATE INDEX "todo_lists_user_id_is_default_idx" ON "todo_lists"("user_id", "is_default");

-- CreateIndex
CREATE INDEX "todo_lists_user_id_sort_order_idx" ON "todo_lists"("user_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- CreateIndex
CREATE INDEX "todos_user_id_status_updated_at_idx" ON "todos"("user_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "todos_user_id_due_at_idx" ON "todos"("user_id", "due_at" ASC);

-- CreateIndex
CREATE INDEX "todos_user_id_list_id_status_updated_at_idx" ON "todos"("user_id", "list_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "todo_tags_tag_id_todo_id_idx" ON "todo_tags"("tag_id", "todo_id");

-- CreateIndex
CREATE INDEX "reminders_remind_at_status_idx" ON "reminders"("remind_at", "status");

-- CreateIndex
CREATE INDEX "reminders_user_id_status_remind_at_idx" ON "reminders"("user_id", "status", "remind_at");

-- CreateIndex
CREATE INDEX "reminders_todo_id_status_idx" ON "reminders"("todo_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_events_dedupe_key_key" ON "reminder_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "reminder_events_user_id_triggered_at_idx" ON "reminder_events"("user_id", "triggered_at" DESC);

-- CreateIndex
CREATE INDEX "reminder_events_status_triggered_at_idx" ON "reminder_events"("status", "triggered_at" DESC);

-- CreateIndex
CREATE INDEX "notification_endpoints_user_id_type_is_enabled_idx" ON "notification_endpoints"("user_id", "type", "is_enabled");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_next_retry_at_idx" ON "notification_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_endpoint_id_created_at_idx" ON "notification_deliveries"("endpoint_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_deliveries_reminder_event_id_idx" ON "notification_deliveries"("reminder_event_id");

-- CreateIndex
CREATE INDEX "admin_operation_logs_admin_user_id_created_at_idx" ON "admin_operation_logs"("admin_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_operation_logs_target_user_id_created_at_idx" ON "admin_operation_logs"("target_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_operation_logs_action_created_at_idx" ON "admin_operation_logs"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_password_reset_tokens" ADD CONSTRAINT "auth_password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_password_reset_tokens" ADD CONSTRAINT "auth_password_reset_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_lists" ADD CONSTRAINT "todo_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "todo_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_tags" ADD CONSTRAINT "todo_tags_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_tags" ADD CONSTRAINT "todo_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_todo_id_fkey" FOREIGN KEY ("todo_id") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_endpoints" ADD CONSTRAINT "notification_endpoints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_reminder_event_id_fkey" FOREIGN KEY ("reminder_event_id") REFERENCES "reminder_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "notification_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

