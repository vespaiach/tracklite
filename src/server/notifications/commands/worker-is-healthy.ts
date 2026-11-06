import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../../../infrastructure/db";
import {
  notificationBatches,
  notificationDeliveries,
  workerHeartbeats,
} from "../../../infrastructure/notifications/tables";
import { dueAt, workerPassWindow } from "../notification-queue";

export async function workerIsHealthy() {
  const [{ healthy }] = await db.execute<{ healthy: boolean }>(sql`
    select exists (
      select 1 from ${workerHeartbeats}
      where ${workerHeartbeats.name} = 'worker'
        and ${workerHeartbeats.lastPassAt} > now() - ${workerPassWindow}
    ) and not exists (
      select 1 from ${notificationDeliveries}
      join ${notificationBatches} on ${notificationBatches.id} = ${notificationDeliveries.batchId}
      where ${notificationDeliveries.state} = 'pending'
        and ${dueAt} < now() - interval '10 minutes'
    ) as healthy`);
  return healthy;
}