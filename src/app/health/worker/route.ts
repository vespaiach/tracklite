import { sql } from "drizzle-orm";
import { db } from "../../../server/shared/db";
import { notificationBatches, notificationDeliveries, workerHeartbeats } from "../../../server/shared/schema";

export async function GET() {
  try {
    return (await workerIsHealthy()) ? new Response("ok") : unavailable();
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return new Response("unavailable", { status: 503 });
}

async function workerIsHealthy() {
  const [{ healthy }] = await db.execute<{ healthy: boolean }>(sql`
    select exists (
      select 1 from ${workerHeartbeats}
      where ${workerHeartbeats.name} = 'worker'
        and ${workerHeartbeats.lastPassAt} > now() - interval '2 minutes'
    ) and not exists (
      select 1 from ${notificationDeliveries}
      join ${notificationBatches} on ${notificationBatches.id} = ${notificationDeliveries.batchId}
      where ${notificationDeliveries.state} = 'pending'
        and coalesce(${notificationDeliveries.nextAttemptAt}, ${notificationBatches.sendAfter}) < now() - interval '10 minutes'
    ) as healthy`);
  return healthy;
}