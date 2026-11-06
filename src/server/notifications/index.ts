import { subscribe } from "../../infrastructure/events";
import { onDomainEvent } from "./handlers/on-domain-event";

subscribe(onDomainEvent);

export { receiveEmailEvent } from "./handlers/receive-email-event";
export { runWorker } from "./handlers/run-worker";
export { notificationStats } from "./commands/notification-stats";
export { workerIsHealthy } from "./commands/worker-is-healthy";
export {
  mentions,
  notificationBatches,
  notificationDeliveries,
  notifications,
  workerHeartbeats,
} from "../../infrastructure/notifications/tables";