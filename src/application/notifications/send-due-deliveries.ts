import type { NotificationChannel } from "../../contract";
import type { Addressee, Delivery, DropChecks, NotificationItem } from "../../domain/notifications/delivery";
import type { DeliveryRepository } from "../../domain/notifications/delivery-repository";
import type { Result } from "../../domain/shared/result";

export type NotificationSender = (
  recipient: Addressee,
  items: NotificationItem[],
  deliveryId: string,
) => Promise<Result<{ providerMessageId: string }, "email-failed">>;

export type DeliveryServices = {
  deliveries: DeliveryRepository;
  senders: Record<NotificationChannel, NotificationSender>;
  deliveryFailed(error: unknown, delivery: Delivery): void;
};

type Outcome = "sent" | "failed" | "dropped";
export type Tally = Record<Outcome, number>;
type Checks = DropChecks<Addressee, NotificationItem>;

export const batchSize = 10;

export function emptyTally(): Tally {
  return { sent: 0, failed: 0, dropped: 0 };
}

export async function sendDueDeliveries(services: DeliveryServices, tally = emptyTally()) {
  const claimed = await services.deliveries.claimDue(batchSize);
  if (claimed.length === 0) return 0;

  const checks = await services.deliveries.dropChecks(claimed);
  for (const delivery of claimed) {
    const outcome = await deliver(services, delivery, checks);
    if (outcome) tally[outcome] += 1;
  }
  return claimed.length;
}

async function deliver(services: DeliveryServices, delivery: Delivery, checks: Checks) {
  try {
    return await sendAndRecord(services, delivery, checks);
  } catch (error) {
    services.deliveryFailed(error, delivery);
    return await recordFailure(services.deliveries, delivery).catch(() => null);
  }
}

async function sendAndRecord(
  { deliveries, senders }: DeliveryServices,
  delivery: Delivery,
  checks: Checks,
): Promise<Outcome | null> {
  const { recipient, kept, droppedIds } = delivery.checkedMessage(checks);
  const sending = recipient !== undefined && kept.length > 0;

  if (!(await deliveries.drop(delivery, droppedIds, !sending))) return null;
  if (!sending) return "dropped";

  const sent = await senders[delivery.props.channel](recipient, kept, delivery.props.id);
  if (!sent.ok) return recordFailure(deliveries, delivery);

  return (await deliveries.recordSent(delivery, sent.value.providerMessageId)) ? "sent" : null;
}

async function recordFailure(deliveries: DeliveryRepository, delivery: Delivery) {
  const next = delivery.afterFailure();
  if (next === "failed") return (await deliveries.recordFailed(delivery)) ? ("failed" as const) : null;

  await deliveries.recordRetry(delivery, next.retryInMinutes);
  return null;
}