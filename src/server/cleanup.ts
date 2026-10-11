import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "./db";
import {
  invitations,
  notificationBatches,
  passwordResetRequests,
  passwordResetTokens,
  sessions,
  signInAttempts,
} from "./schema";

const chunkSize = 1_000;

export async function deleteExpiredRows() {
  await deleteInChunks(
    invitations,
    sql`least(accepted_at, revoked_at, expires_at) < now() - interval '30 days'`,
  );

  await deleteInChunks(passwordResetTokens, sql`least(used_at, expires_at) < now() - interval '30 days'`);

  await deleteInChunks(sessions, sql`last_active_at < now() - interval '60 days'`);

  await deleteInChunks(
    notificationBatches,
    sql`not exists (
      select from notification_deliveries delivery
      where delivery.batch_id = notification_batches.id
        and (delivery.state = 'pending'
          or coalesce(delivery.sent_at, delivery.next_attempt_at, notification_batches.send_after)
            >= now() - interval '30 days'))`,
  );

  await deleteInChunks(signInAttempts, sql`created_at < now() - interval '30 days 1 hour'`);

  await deleteInChunks(passwordResetRequests, sql`created_at < now() - interval '31 days'`);
}

async function deleteInChunks(table: PgTable, expired: SQL) {
  let deleted: number;
  do {
    const result = await db.execute(sql`
      delete from ${table}
      where ctid in (select ctid from ${table} where ${expired} limit ${chunkSize})`);
    deleted = result.count;
  } while (deleted === chunkSize);
}