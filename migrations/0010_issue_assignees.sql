CREATE TABLE "issue_assignees" (
	"issue_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "issue_assignees_issue_id_member_id_pk" PRIMARY KEY("issue_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "issues" DROP CONSTRAINT "issues_assignee_id_members_id_fk";
--> statement-breakpoint
DROP INDEX "issues_assignee_idx";--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_assignees_member_idx" ON "issue_assignees" USING btree ("member_id");--> statement-breakpoint
INSERT INTO "issue_assignees" ("issue_id", "member_id") SELECT "id", "assignee_id" FROM "issues" WHERE "assignee_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "assignee_id";