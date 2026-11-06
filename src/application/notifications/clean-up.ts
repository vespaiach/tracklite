import type { DeliveryRepository } from "../../domain/notifications/delivery-repository";

export type CleanUpServices = {
  deleteExpiredAccountRows(): Promise<void>;
  deliveries: DeliveryRepository;
  deletePublishedEvents(): Promise<void>;
};

export async function cleanUp({
  deleteExpiredAccountRows,
  deliveries,
  deletePublishedEvents,
}: CleanUpServices) {
  await deleteExpiredAccountRows();

  await deliveries.deleteFinishedBatches();

  await deletePublishedEvents();
}