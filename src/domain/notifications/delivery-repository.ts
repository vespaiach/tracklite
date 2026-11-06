import type { Addressee, Delivery, DropChecks, NotificationItem } from "./delivery";

export interface DeliveryRepository {
  claimDue(limit: number): Promise<Delivery[]>;
  dropChecks(claimed: Delivery[]): Promise<DropChecks<Addressee, NotificationItem>>;
  drop(delivery: Delivery, notificationIds: string[], wholeDelivery: boolean): Promise<boolean>;
  recordSent(delivery: Delivery, providerMessageId: string): Promise<boolean>;
  recordRetry(delivery: Delivery, retryInMinutes: number): Promise<void>;
  recordFailed(delivery: Delivery): Promise<boolean>;
  markBounced(providerMessageId: string): Promise<string | undefined>;
  deleteFinishedBatches(): Promise<void>;
}