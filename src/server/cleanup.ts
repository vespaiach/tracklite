import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";

export function deleteExpiredRows() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      delete from invitations
      where least(accepted_at, revoked_at, expires_at) < now() - interval '30 days'`);
    await tx.execute(sql`
      delete from password_reset_tokens
      where least(used_at, expires_at) < now() - interval '30 days'`);
    await tx.execute(sql`
      delete from sessions
      where last_active_at < now() - interval '60 days'`);
    await tx.execute(sql`
      delete from notification_emails
      where state <> 'pending'
        and coalesce(sent_at, next_attempt_at, send_after) < now() - interval '30 days'`);
    await tx.execute(sql`
      delete from sign_in_attempts
      where created_at < now() - interval '30 days 1 hour'`);
    await tx.execute(sql`
      delete from password_reset_requests
      where created_at < now() - interval '31 days'`);
  });
}