import type { DeliveryRepository } from "../../domain/notifications/delivery-repository";

export type CleanUpServices = {
  deleteExpiredAccountRows(): Promise<void>;
  deliveries: DeliveryRepository;
};

export async function cleanUp({ deleteExpiredAccountRows, deliveries }: CleanUpServices) {
  await deleteExpiredAccountRows();

  await deliveries.deleteFinishedBatches();
}