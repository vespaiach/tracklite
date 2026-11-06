import "server-only";
import { recordNotifications } from "../../application/notifications/record-notifications";
import { subscribe } from "../events";
import { drizzleNotificationRepository } from "./drizzle-notification-repository";

subscribe((tx, event) => recordNotifications(drizzleNotificationRepository(tx), event));