import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "../shared/db";
import { notificationBatches, notificationDeliveries, workerHeartbeats } from "./tables";

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

export async function workerIsHealthy() {
  const [{ healthy }] = await db.execute<{ healthy: boolean }>(sql`
    select exists (
      select 1 from ${workerHeartbeats}
      where ${workerHeartbeats.name} = 'worker'
        and ${workerHeartbeats.lastPassAt} > now() - interval '2 minutes'
    ) and not exists (
      select 1 from ${notificationDeliveries}
      join ${notificationBatches} on ${notificationBatches.id} = ${notificationDeliveries.batchId}
      where ${notificationDeliveries.state} = 'pending'
        and ${dueAt} < now() - interval '10 minutes'
    ) as healthy`);
  return healthy;
}