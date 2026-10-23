import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, labelColor, timestamptz } from "../shared/schema";
import { members } from "../identity/tables";
import type { ProjectKey } from "./schemas";

export const projectKeys = pgTable("project_keys", {
  key: text("key").primaryKey(),
});

export const projects = pgTable(
  "projects",
  {
    id: id(),
    key: text("key")
      .$type<ProjectKey>()
      .notNull()
      .unique()
      .references(() => projectKeys.key),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    descriptionVersion: integer("description_version").notNull().default(0),
    descriptionEditedBy: uuid("description_edited_by").references(() => members.id),
    nextIssueNumber: integer("next_issue_number").notNull().default(1),
    archivedAt: timestamptz("archived_at"),
    createdAt: createdAt(),
    createdBy: uuid("created_by").references(() => members.id),
  },
  (t) => [check("projects_key_format", sql`${t.key} ~ '^[A-Z]{2,5}$'`)],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: labelColor("color").notNull(),
  },
  (t) => [uniqueIndex("labels_project_name_key").on(t.projectId, sql`lower(${t.name})`)],
);