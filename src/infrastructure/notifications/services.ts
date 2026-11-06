import "server-only";
import { sql } from "drizzle-orm";
import type { CleanUpServices } from "../../application/notifications/clean-up";
import type { EmailEventServices } from "../../application/notifications/receive-email-event";
import type { DeliveryServices } from "../../application/notifications/send-due-deliveries";
import { markInvitationBounced } from "../../application/identity/mark-invitation-bounced";
import { deleteInChunks } from "../chunked-delete";
import { deleteExpiredAccountRows } from "../identity/delete-expired-account-rows";
import { identityWork } from "../identity/repositories";
import { logError, logInfo } from "../log";
import { notificationSenders } from "./channels";
import { drizzleDeliveryRepository } from "./drizzle-delivery-repository";
import { isSignedEmailEvent } from "./email-signatures";
import { outboxEvents } from "./tables";

export const deliveryServices: DeliveryServices = {
  deliveries: drizzleDeliveryRepository,
  senders: notificationSenders,
  deliveryFailed: (error, { props }) =>
    logError("outbox", "delivery-failed", error, { deliveryId: props.id, channel: props.channel }),
};

export const cleanUpServices: CleanUpServices = {
  deleteExpiredAccountRows,
  deliveries: drizzleDeliveryRepository,
  deletePublishedEvents: () =>
    deleteInChunks(outboxEvents, sql`${outboxEvents.publishedAt} < now() - interval '30 days'`),
};

export const emailEventServices: EmailEventServices = {
  signatures: { verify: isSignedEmailEvent },
  deliveries: drizzleDeliveryRepository,
  invitations: { markBounced: (providerMessageId) => markInvitationBounced(identityWork, providerMessageId) },
  logMail: (event, fields) => logInfo("mail", event, fields),
};