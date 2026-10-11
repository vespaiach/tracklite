CREATE TABLE "worker_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_pass_at" timestamp with time zone NOT NULL
);
