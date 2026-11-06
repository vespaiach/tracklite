import "server-only";
import type { DeliveryServices } from "../../../application/notifications/send-due-deliveries";
import { sendNotificationEmail } from "./email";

export const notificationSenders: DeliveryServices["senders"] = {
  email: sendNotificationEmail,
};