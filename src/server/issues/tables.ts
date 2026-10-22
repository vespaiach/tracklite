import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { byteOrderedText, createdAt, id, issuePriority, issueStatus, timestamptz } from "../shared/schema";
import { members } from "../identity/tables";
import { labels, projects } from "../projects/tables";

export const issues = pgTable(
  "issues",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    descriptionVersion: integer("description_version").notNull().default(0),
    descriptionEditedBy: uuid("description_edited_by").references(() => members.id),
    status: issueStatus("status").notNull(),
    priority: issuePriority("priority").notNull(),
    assigneeId: uuid("assignee_id").references(() => members.id),
    position: byteOrderedText("position").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => members.id),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    statusChangedAt: timestamptz("status_changed_at").notNull().defaultNow(),
    requestId: uuid("request_id").notNull().unique(),
  },
  (t) => [
    uniqueIndex("issues_project_number_key").on(t.projectId, t.number),
    index("issues_board_idx").on(t.projectId, t.status, t.position),
    index("issues_updated_idx").on(t.projectId, t.updatedAt.desc()),
    index("issues_assignee_idx").on(t.assigneeId, t.status),
    index("issues_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("issues_description_trgm_idx").using("gin", t.description.op("gin_trgm_ops")),
  ],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] })],
);