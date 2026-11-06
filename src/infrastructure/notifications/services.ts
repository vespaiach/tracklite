import "server-only";
import type { CleanUpServices } from "../../application/notifications/clean-up";
import type { EmailEventServices } from "../../application/notifications/receive-email-event";
import type { DeliveryServices } from "../../application/notifications/send-due-deliveries";
import { markInvitationBounced } from "../../application/identity/mark-invitation-bounced";
import { deleteExpiredAccountRows } from "../identity/delete-expired-account-rows";
import { identityWork } from "../identity/repositories";
import { logError, logInfo } from "../log";
import { notificationSenders } from "./channels";
import { drizzleDeliveryRepository } from "./drizzle-delivery-repository";
import { isSignedEmailEvent } from "./email-signatures";

export const deliveryServices: DeliveryServices = {
  deliveries: drizzleDeliveryRepository,
  senders: notificationSenders,
  deliveryFailed: (error, { props }) =>
    logError("worker", "delivery-failed", error, { deliveryId: props.id, channel: props.channel }),
};

export const cleanUpServices: CleanUpServices = {
  deleteExpiredAccountRows,
  deliveries: drizzleDeliveryRepository,
};

export const emailEventServices: EmailEventServices = {
  signatures: { verify: isSignedEmailEvent },
  deliveries: drizzleDeliveryRepository,
  invitations: { markBounced: (providerMessageId) => markInvitationBounced(identityWork, providerMessageId) },
  logMail: (event, fields) => logInfo("mail", event, fields),
};