import { subscribe } from "../shared/events";
import { onDomainEvent } from "./notifications";

subscribe(onDomainEvent);

export { receiveEmailEvent } from "./email-webhook";
export { workerIsHealthy } from "./notification-queue";
export { notificationStats } from "./notification-stats";
export { runWorker } from "./worker";
export {
  mentions,
  notificationBatches,
  notificationDeliveries,
  notifications,
  workerHeartbeats,
} from "./tables";