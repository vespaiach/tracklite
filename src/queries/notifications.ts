import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  type ChannelStats,
  type NotificationStats,
  notificationChannels,
  type ProblemDelivery,
} from "../contract";
import { type Actor, assertAdmin } from "../domain/identity/actor";
import { db } from "../infrastructure/db";
import { members } from "../infrastructure/identity/tables";
import {
  notificationBatches,
  notificationDeliveries,
  notifications,
  workerHeartbeats,
} from "../infrastructure/notifications/tables";

type ProblemRow = Awaited<ReturnType<typeof problemRows>>[number];

const recentProblemCount = 20;
const finishedState = ["sent", "dropped", "failed", "bounced"] as const;
const workerPassWindow = sql`interval '2 minutes'`;

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
        and ${workerHeartbeats.lastPassAt} > now() - ${workerPassWindow}
    ) and not exists (
      select 1 from ${notificationDeliveries}
      join ${notificationBatches} on ${notificationBatches.id} = ${notificationDeliveries.batchId}
      where ${notificationDeliveries.state} = 'pending'
        and ${dueAt} < now() - interval '10 minutes'
    ) as healthy`);
  return healthy;
}

export async function notificationStats(actor: Actor): Promise<NotificationStats> {
  assertAdmin(actor);

  return {
    ...(await workerLastPass()),
    queue: await queueCounts(),
    channels: await channelStats(),
    recentProblems: (await problemRows()).map(problemDelivery),
  };
}

async function workerLastPass() {
  const [heartbeat] = await db
    .select({
      lastPassAt: workerHeartbeats.lastPassAt,
      staleMinutes: sql<number | null>`case when ${workerHeartbeats.lastPassAt} <= now() - ${workerPassWindow}
        then floor(extract(epoch from now() - ${workerHeartbeats.lastPassAt}) / 60)::int end`,
    })
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.name, "worker"));
  return {
    workerLastPassAt: heartbeat?.lastPassAt.toISOString() ?? null,
    workerStaleMinutes: heartbeat?.staleMinutes ?? null,
  };
}

async function channelStats() {
  const counted = await db
    .select({
      channel: notificationDeliveries.channel,
      sent: countIn("sent"),
      dropped: countIn("dropped"),
      failed: countIn("failed"),
      bounced: countIn("bounced"),
    })
    .from(notificationDeliveries)
    .where(sql`${notificationDeliveries.stateChangedAt} > now() - interval '24 hours'`)
    .groupBy(notificationDeliveries.channel);

  return notificationChannels.map(
    (channel): ChannelStats =>
      counted.find((row) => row.channel === channel) ?? {
        channel,
        sent: 0,
        dropped: 0,
        failed: 0,
        bounced: 0,
      },
  );
}

function countIn(state: (typeof finishedState)[number]) {
  return sql<number>`(count(*) filter (where ${notificationDeliveries.state} = ${state}))::int`;
}

function problemRows() {
  return db
    .select({
      id: notificationDeliveries.id,
      username: members.username,
      channel: notificationDeliveries.channel,
      target: targetOfNewestNotification(),
      state: sql<ProblemDelivery["state"]>`${notificationDeliveries.state}`,
      attempts: notificationDeliveries.attempts,
      at: sql`${notificationDeliveries.stateChangedAt}`.mapWith(notificationDeliveries.stateChangedAt),
    })
    .from(notificationDeliveries)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notificationDeliveries.batchId))
    .innerJoin(members, eq(members.id, notificationBatches.recipientId))
    .where(
      and(
        inArray(notificationDeliveries.state, ["failed", "bounced"]),
        isNotNull(notificationDeliveries.stateChangedAt),
      ),
    )
    .orderBy(desc(notificationDeliveries.stateChangedAt), desc(notificationDeliveries.id))
    .limit(recentProblemCount);
}

function targetOfNewestNotification() {
  return sql<string>`(
    select coalesce(${notifications.issueRef}, ${notifications.projectKey}) from ${notifications}
    where ${notifications.batchId} = ${notificationDeliveries.batchId}
    order by ${notifications.createdAt} desc, ${notifications.id} desc
    limit 1
  )`;
}

function problemDelivery(row: ProblemRow): ProblemDelivery {
  return {
    ...row,
    attempts: row.state === "bounced" ? row.attempts + 1 : row.attempts,
    at: row.at.toISOString(),
  };
}