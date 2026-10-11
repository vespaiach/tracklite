import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";

const serverUrl = process.env.DATABASE_URL ?? "";
const dbName = `tracklite_migration_${randomBytes(4).toString("hex")}`;
const dataDbName = `${dbName}_data`;
const leftoverDbName = `${dbName}_leftover`;
const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });

type JournalEntry = { idx: number; tag: string };

beforeAll(async () => {
  await admin.unsafe(`create database ${dbName}`);
  await admin.unsafe(`create database ${dataDbName}`);
  await admin.unsafe(`create database ${leftoverDbName}`);
});

afterAll(async () => {
  await admin.unsafe(`drop database if exists ${dbName} with (force)`);
  await admin.unsafe(`drop database if exists ${dataDbName} with (force)`);
  await admin.unsafe(`drop database if exists ${leftoverDbName} with (force)`);
  await admin.end();
});

function connectTo(name: string) {
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return postgres(url.toString(), { max: 1, onnotice: () => {} });
}

function migrationsUpTo(lastTag: string) {
  const journal = JSON.parse(readFileSync("migrations/meta/_journal.json", "utf8"));
  const last = journal.entries.findIndex((entry: JournalEntry) => entry.tag === lastTag);
  const entries: JournalEntry[] = journal.entries.slice(0, last + 1);
  const folder = mkdtempSync(join(tmpdir(), "tracklite-migrations-"));
  mkdirSync(join(folder, "meta"));
  for (const { tag } of entries) copyFileSync(`migrations/${tag}.sql`, join(folder, `${tag}.sql`));
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return folder;
}

it("the migration applies to an empty database", async () => {
  const client = connectTo(dbName);
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
      "notification_batches",
      "notification_deliveries",
      "notifications",
      "password_reset_requests",
      "password_reset_tokens",
      "project_keys",
      "projects",
      "sessions",
      "sign_in_attempts",
      "worker_heartbeats",
    ]);

    // Declared order matters: ORDER BY status/priority relies on it (design §2.1).
    const enums = await client<{ name: string; values: string[] }[]>`
      select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      group by t.typname order by t.typname`;
    expect(enums).toEqual([
      { name: "delivery_state", values: ["pending", "sent", "dropped", "failed", "bounced"] },
      { name: "issue_priority", values: ["urgent", "high", "medium", "low", "none"] },
      { name: "issue_status", values: ["backlog", "in_progress", "in_review", "done", "canceled"] },
      {
        name: "label_color",
        values: ["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"],
      },
      { name: "notification_channel", values: ["email"] },
      { name: "notification_kind", values: ["assigned", "mentioned"] },
      { name: "role", values: ["admin", "member"] },
    ]);
  } finally {
    await client.end();
  }
});

it("§2.6: the migration moves notification emails into batches and deliveries, keeping their ids", async () => {
  const client = connectTo(dataDbName);
  try {
    await migrate(drizzle(client), { migrationsFolder: migrationsUpTo("0003_issue_position_byte_order") });
    const [sam] = await client`
      insert into members (email, full_name, username, password_hash, role)
      values ('sam@acme.com', 'Sam Lee', 'sam', 'hash', 'member') returning id`;
    const [pending] = await client`
      insert into notification_emails (recipient_id, target_type, target_id, send_after, state)
      values (${sam.id}, 'issue', gen_random_uuid(), now() + interval '1 minute', 'pending')
      returning id, target_id, send_after`;
    const [sent] = await client`
      insert into notification_emails
        (recipient_id, target_type, target_id, send_after, state, attempts, provider_message_id, sent_at)
      values (${sam.id}, 'project', gen_random_uuid(), now() - interval '1 hour', 'sent', 1, 'msg-1', now())
      returning id, sent_at`;
    for (const email of [pending, sent]) {
      await client`
        insert into notifications (email_id, kind, actor_id, project_name, project_key, link_path, excerpt)
        values (${email.id}, 'assigned', ${sam.id}, 'Website', 'WEB', '/issue/WEB-1', '')`;
    }

    await migrate(drizzle(client), { migrationsFolder: "migrations" });

    expect(
      await client`
        select id, recipient_id, target_type, target_id, send_after
        from notification_batches where id = ${pending.id}`,
    ).toEqual([
      {
        id: pending.id,
        recipient_id: sam.id,
        target_type: "issue",
        target_id: pending.target_id,
        send_after: pending.send_after,
      },
    ]);
    expect(
      await client`
        select id, batch_id, channel, state, attempts, provider_message_id, sent_at
        from notification_deliveries order by state`,
    ).toEqual([
      {
        id: pending.id,
        batch_id: pending.id,
        channel: "email",
        state: "pending",
        attempts: 0,
        provider_message_id: null,
        sent_at: null,
      },
      {
        id: sent.id,
        batch_id: sent.id,
        channel: "email",
        state: "sent",
        attempts: 1,
        provider_message_id: "msg-1",
        sent_at: sent.sent_at,
      },
    ]);
    expect(await client`select batch_id from notifications order by batch_id`).toEqual(
      [pending.id, sent.id].sort().map((id) => ({ batch_id: id })),
    );
    expect(await client`select notification_channels::text[] as notification_channels from members`).toEqual([
      { notification_channels: ["email"] },
    ]);
  } finally {
    await client.end();
  }
});

it("§2.6: notifications.batch_id is required and email_id is gone", async () => {
  const client = connectTo(dbName);
  try {
    await migrate(drizzle(client), { migrationsFolder: "migrations" });

    const columns = await client<{ name: string; is_nullable: string }[]>`
      select column_name as name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name in ('batch_id', 'email_id')`;
    expect(columns).toEqual([{ name: "batch_id", is_nullable: "NO" }]);
  } finally {
    await client.end();
  }
});

it("§2.6: dropping notification_emails carries leftover rows and their notifications over", async () => {
  const client = connectTo(leftoverDbName);
  try {
    await migrate(drizzle(client), { migrationsFolder: migrationsUpTo("0003_issue_position_byte_order") });
    const [sam] = await client`
      insert into members (email, full_name, username, password_hash, role)
      values ('sam@acme.com', 'Sam Lee', 'sam', 'hash', 'member') returning id`;
    const [moved] = await client`
      insert into notification_emails (recipient_id, target_type, target_id, send_after, state)
      values (${sam.id}, 'issue', gen_random_uuid(), now() + interval '1 minute', 'pending') returning id`;
    await insertNotificationForEmail(client, moved.id, sam.id);

    await migrate(drizzle(client), { migrationsFolder: migrationsUpTo("0004_notification_channels") });
    const [leftover] = await client`
      insert into notification_emails (recipient_id, target_type, target_id, send_after, state, attempts, next_attempt_at)
      values (${sam.id}, 'project', gen_random_uuid(), now() - interval '5 minutes', 'failed', 2, now())
      returning id, target_id, send_after, next_attempt_at, created_at`;
    await insertNotificationForEmail(client, leftover.id, sam.id);
    await insertNotificationForEmail(client, moved.id, sam.id);

    await migrate(drizzle(client), { migrationsFolder: "migrations" });

    expect(
      await client`
        select id, recipient_id, target_type, target_id, send_after, created_at
        from notification_batches where id = ${leftover.id}`,
    ).toEqual([
      {
        id: leftover.id,
        recipient_id: sam.id,
        target_type: "project",
        target_id: leftover.target_id,
        send_after: leftover.send_after,
        created_at: leftover.created_at,
      },
    ]);
    expect(
      await client`
        select id, batch_id, channel, state, attempts, next_attempt_at
        from notification_deliveries where id = ${leftover.id}`,
    ).toEqual([
      {
        id: leftover.id,
        batch_id: leftover.id,
        channel: "email",
        state: "failed",
        attempts: 2,
        next_attempt_at: leftover.next_attempt_at,
      },
    ]);
    expect(await client`select count(*)::int as count from notification_batches`).toEqual([{ count: 2 }]);
    expect(await client`select count(*)::int as count from notification_deliveries`).toEqual([{ count: 2 }]);
    expect(await client`select batch_id from notifications order by batch_id`).toEqual(
      [moved.id, moved.id, leftover.id].sort().map((id) => ({ batch_id: id })),
    );
  } finally {
    await client.end();
  }
});

function insertNotificationForEmail(client: postgres.Sql, emailId: string, actorId: string) {
  return client`
    insert into notifications (email_id, kind, actor_id, project_name, project_key, link_path, excerpt)
    values (${emailId}, 'assigned', ${actorId}, 'Website', 'WEB', '/issue/WEB-1', '')`;
}