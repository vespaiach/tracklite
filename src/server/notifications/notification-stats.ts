import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  type ChannelStats,
  type NotificationStats,
  notificationChannels,
  type ProblemDelivery,
} from "../../contract";
import { db } from "../shared/db";
import { queueCounts } from "./notification-queue";
import {
  members,
  notificationBatches,
  notificationDeliveries,
  notifications,
  workerHeartbeats,
} from "../shared/schema";
import { assertAdmin, type Member } from "../identity";

type ProblemRow = Awaited<ReturnType<typeof problemRows>>[number];

const recentProblemCount = 20;
const finishedState = ["sent", "dropped", "failed", "bounced"] as const;

export async function notificationStats(actor: Member): Promise<NotificationStats> {
  assertAdmin(actor);

  return {
    workerLastPassAt: await workerLastPassAt(),
    queue: await queueCounts(),
    channels: await channelStats(),
    recentProblems: (await problemRows()).map(problemDelivery),
  };
}

async function workerLastPassAt() {
  const [heartbeat] = await db
    .select({ lastPassAt: workerHeartbeats.lastPassAt })
    .from(workerHeartbeats)
    .where(eq(workerHeartbeats.name, "worker"));
  return heartbeat?.lastPassAt.toISOString() ?? null;
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