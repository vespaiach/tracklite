import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { readConfig } from "./config";
import { db } from "./db";
import { productionEmailProvider } from "./email/production";
import { logEmailBounce } from "./log";
import { invitations, notificationDeliveries } from "./schema";

async function markBounced(providerMessageId: string) {
  const [notification] = await db
    .update(notificationDeliveries)
    .set({ state: "bounced" })
    .where(
      and(
        eq(notificationDeliveries.channel, "email"),
        eq(notificationDeliveries.providerMessageId, providerMessageId),
      ),
    )
    .returning({ id: notificationDeliveries.id });
  if (notification) return logEmailBounce(`email bounced, notification ${notification.id}`);

  const [invitation] = await db
    .update(invitations)
    .set({ bouncedAt: sql`now()` })
    .where(eq(invitations.providerMessageId, providerMessageId))
    .returning({ id: invitations.id });
  if (invitation) return logEmailBounce(`email bounced, invitation ${invitation.id}`);

  logEmailBounce("email bounced, untracked");
}

export async function receiveEmailEvent(headers: Headers, body: string) {
  const report = productionEmailProvider.readBounceReport(headers, body, {
    webhookSecret: readConfig().emailWebhookSecret,
  });
  if (report === "unsigned") return false;

  if (report.bouncedMessageId !== null) await markBounced(report.bouncedMessageId);

  return true;
}