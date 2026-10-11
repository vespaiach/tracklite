CREATE TYPE "public"."delivery_state" AS ENUM('pending', 'sent', 'dropped', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email');--> statement-breakpoint
CREATE TABLE "notification_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_batches_target_type" CHECK ("notification_batches"."target_type" in ('issue', 'project'))
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"state" "delivery_state" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "email_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notification_channels" "notification_channel"[] DEFAULT '{"email"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_batches" ADD CONSTRAINT "notification_batches_recipient_id_members_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_batch_id_notification_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."notification_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_batch_channel_key" ON "notification_deliveries" USING btree ("batch_id","channel");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_batch_id_notification_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."notification_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_notification_channels_not_empty" CHECK (cardinality("members"."notification_channels") > 0);--> statement-breakpoint
INSERT INTO "notification_batches" ("id", "recipient_id", "target_type", "target_id", "send_after", "created_at")
SELECT "id", "recipient_id", "target_type", "target_id", "send_after", "created_at" FROM "notification_emails";--> statement-breakpoint
INSERT INTO "notification_deliveries" ("id", "batch_id", "channel", "state", "attempts", "next_attempt_at", "provider_message_id", "created_at", "sent_at")
SELECT "id", "id", 'email', "state"::text::"delivery_state", "attempts", "next_attempt_at", "provider_message_id", "created_at", "sent_at" FROM "notification_emails";--> statement-breakpoint
UPDATE "notifications" SET "batch_id" = "email_id";