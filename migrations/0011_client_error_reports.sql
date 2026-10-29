CREATE TABLE "client_error_reports" (
	"username" text,
	"ip" "inet" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "client_error_reports_username_idx" ON "client_error_reports" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "client_error_reports_ip_idx" ON "client_error_reports" USING btree ("ip","created_at");