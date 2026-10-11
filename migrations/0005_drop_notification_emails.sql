INSERT INTO "notification_batches" ("id", "recipient_id", "target_type", "target_id", "send_after", "created_at")
SELECT "id", "recipient_id", "target_type", "target_id", "send_after", "created_at" FROM "notification_emails"
WHERE NOT EXISTS (SELECT 1 FROM "notification_batches" WHERE "notification_batches"."id" = "notification_emails"."id");--> statement-breakpoint
INSERT INTO "notification_deliveries" ("id", "batch_id", "channel", "state", "attempts", "next_attempt_at", "provider_message_id", "created_at", "sent_at")
SELECT "id", "id", 'email', "state"::text::"delivery_state", "attempts", "next_attempt_at", "provider_message_id", "created_at", "sent_at" FROM "notification_emails"
WHERE NOT EXISTS (SELECT 1 FROM "notification_deliveries" WHERE "notification_deliveries"."id" = "notification_emails"."id");--> statement-breakpoint
UPDATE "notifications" SET "batch_id" = "email_id" WHERE "batch_id" IS NULL;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_email_id_notification_emails_id_fk";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "batch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "email_id";--> statement-breakpoint
ALTER TABLE "notification_emails" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "notification_emails" CASCADE;--> statement-breakpoint
DROP TYPE "public"."email_state";
