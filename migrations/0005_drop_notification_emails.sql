ALTER TABLE "notifications" DROP CONSTRAINT "notifications_email_id_notification_emails_id_fk";--> statement-breakpoint
DROP TABLE "notification_emails";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "batch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "email_id";--> statement-breakpoint
DROP TYPE "public"."email_state";