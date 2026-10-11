import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { notificationBatches, notificationDeliveries } from "./schema";

export const dueAt = sql`coalesce(${notificationDeliveries.nextAttemptAt}, ${notificationBatches.sendAfter})`;

export async function queueCounts() {
  const [counts] = await db
    .select({
      pending: sql<number>`count(*)::int`,
      due: sql<number>`(count(*) filter (where ${dueAt} <= now()))::int`,
      oldestDueSeconds: sql<number>`coalesce(floor(extract(epoch from now() - min(${dueAt}) filter (where ${dueAt} <= now()))), 0)::int`,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notificationDeliveries.batchId))
    .where(eq(notificationDeliveries.state, "pending"));
  return counts;
}