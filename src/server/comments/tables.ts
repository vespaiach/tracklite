import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, timestamptz } from "../shared/schema";
import { members } from "../identity/tables";
import { issues } from "../issues/tables";
import { projects } from "../projects/tables";

export const comments = pgTable(
  "comments",
  {
    id: id(),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => members.id),
    body: text("body").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    editedAt: timestamptz("edited_at"),
    requestId: uuid("request_id").notNull().unique(),
  },
  (t) => [
    check("comments_one_parent", sql`num_nonnulls(${t.issueId}, ${t.projectId}) = 1`),
    index("comments_issue_idx").on(t.issueId, t.createdAt),
    index("comments_project_idx").on(t.projectId, t.createdAt),
  ],
);