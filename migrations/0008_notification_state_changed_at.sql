ALTER TABLE "notification_deliveries" ADD COLUMN "state_changed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "notification_deliveries" AS d
SET "state_changed_at" = coalesce(d."sent_at", d."next_attempt_at", b."send_after")
FROM "notification_batches" AS b
WHERE b."id" = d."batch_id" AND d."state" <> 'pending';
