import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";

const serverUrl = process.env.DATABASE_URL ?? "";
const dbName = `tracklite_migration_${randomBytes(4).toString("hex")}`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });

beforeAll(async () => {
  await admin.unsafe(`create database ${dbName}`);
});

afterAll(async () => {
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.end();
});

it("the migration applies to an empty database", async () => {
  const url = new URL(serverUrl);
  url.pathname = `/${dbName}`;
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "migrations" });

    const tables = await client<{ name: string }[]>`
      select table_name as name from information_schema.tables
      where table_schema = 'public' order by table_name`;
    expect(tables.map((t) => t.name)).toEqual([
      "comments",
      "invitations",
      "issue_labels",
      "issues",
      "labels",
      "members",
      "mentions",
      "notification_emails",
      "notifications",
      "password_reset_requests",
      "password_reset_tokens",
      "project_keys",
      "projects",
      "sessions",
      "sign_in_attempts",
    ]);

    // Declared order matters: ORDER BY status/priority relies on it (design §2.1).
    const enums = await client<{ name: string; values: string[] }[]>`
      select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      group by t.typname order by t.typname`;
    expect(enums).toEqual([
      { name: "email_state", values: ["pending", "sent", "dropped", "failed", "bounced"] },
      { name: "issue_priority", values: ["urgent", "high", "medium", "low", "none"] },
      { name: "issue_status", values: ["backlog", "in_progress", "in_review", "done", "canceled"] },
      {
        name: "label_color",
        values: ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"],
      },
      { name: "notification_kind", values: ["assigned", "mentioned"] },
      { name: "role", values: ["admin", "member"] },
    ]);
  } finally {
    await client.end();
  }
});