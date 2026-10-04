-- Added by hand: the gin_trgm_ops indexes on issues need pg_trgm (design §2.4, D-5).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."email_state" AS ENUM('pending', 'sent', 'dropped', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."issue_priority" AS ENUM('urgent', 'high', 'medium', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('backlog', 'in_progress', 'in_review', 'done', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."label_color" AS ENUM('gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('assigned', 'mentioned');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid,
	"project_id" uuid,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"request_id" uuid NOT NULL,
	CONSTRAINT "comments_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "comments_one_parent" CHECK (num_nonnulls("comments"."issue_id", "comments"."project_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "issue_labels" (
	"issue_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "issue_labels_issue_id_label_id_pk" PRIMARY KEY("issue_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_version" integer DEFAULT 0 NOT NULL,
	"status" "issue_status" NOT NULL,
	"priority" "issue_priority" NOT NULL,
	"assignee_id" uuid,
	"position" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid NOT NULL,
	CONSTRAINT "issues_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" "label_color" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_username_format" CHECK ("members"."username" ~ '^[a-z0-9-]{2,20}$')
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"issue_id" uuid,
	"project_id" uuid,
	"comment_id" uuid,
	CONSTRAINT "mentions_one_source" CHECK (num_nonnulls("mentions"."issue_id", "mentions"."project_id", "mentions"."comment_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "notification_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"state" "email_state" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_emails_target_type" CHECK ("notification_emails"."target_type" in ('issue', 'project'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"actor_id" uuid NOT NULL,
	"comment_id" uuid,
	"dropped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issue_ref" text,
	"issue_title" text,
	"project_name" text NOT NULL,
	"project_key" text NOT NULL,
	"link_path" text NOT NULL,
	"excerpt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_requests" (
	"email" text NOT NULL,
	"ip" "inet" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "project_keys" (
	"key" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_version" integer DEFAULT 0 NOT NULL,
	"next_issue_number" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_key_unique" UNIQUE("key"),
	CONSTRAINT "projects_key_format" CHECK ("projects"."key" ~ '^[A-Z]{2,5}$')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempts" (
	"email" text NOT NULL,
	"ip" "inet" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_members_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_emails" ADD CONSTRAINT "notification_emails_recipient_id_members_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_email_id_notification_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."notification_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_key_project_keys_key_fk" FOREIGN KEY ("key") REFERENCES "public"."project_keys"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_issue_idx" ON "comments" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_project_idx" ON "comments" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_open_email_key" ON "invitations" USING btree (lower("email")) WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "issues_project_number_key" ON "issues" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "issues_board_idx" ON "issues" USING btree ("project_id","status","position");--> statement-breakpoint
CREATE INDEX "issues_updated_idx" ON "issues" USING btree ("project_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issues_assignee_idx" ON "issues" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "issues_title_trgm_idx" ON "issues" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "issues_description_trgm_idx" ON "issues" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "labels_project_name_key" ON "labels" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_key" ON "members" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "members_username_key" ON "members" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_member_issue_key" ON "mentions" USING btree ("member_id","issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_member_project_key" ON "mentions" USING btree ("member_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_member_comment_key" ON "mentions" USING btree ("member_id","comment_id");--> statement-breakpoint
CREATE INDEX "password_reset_requests_email_idx" ON "password_reset_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "password_reset_requests_ip_idx" ON "password_reset_requests" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_email_idx" ON "sign_in_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_ip_idx" ON "sign_in_attempts" USING btree ("ip","created_at");