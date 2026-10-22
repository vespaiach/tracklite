import "server-only";
import { sql } from "drizzle-orm";
import { deleteInChunks } from "../shared/chunked-delete";
import { invitations, passwordResetRequests, passwordResetTokens, sessions, signInAttempts } from "./tables";

export async function deleteExpiredAccountRows() {
  await deleteInChunks(
    invitations,
    sql`least(accepted_at, revoked_at, expires_at) < now() - interval '30 days'`,
  );

  await deleteInChunks(passwordResetTokens, sql`least(used_at, expires_at) < now() - interval '30 days'`);

  await deleteInChunks(sessions, sql`last_active_at < now() - interval '60 days'`);

  await deleteInChunks(signInAttempts, sql`created_at < now() - interval '30 days 1 hour'`);

  await deleteInChunks(passwordResetRequests, sql`created_at < now() - interval '31 days'`);
}