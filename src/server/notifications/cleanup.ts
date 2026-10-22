import "server-only";
import { sql } from "drizzle-orm";
import { deleteExpiredAccountRows } from "../identity";
import { deleteInChunks } from "../shared/chunked-delete";
import { notificationBatches } from "./tables";

export async function deleteExpiredRows() {
  await deleteExpiredAccountRows();

  await deleteInChunks(
    notificationBatches,
    sql`not exists (
      select from notification_deliveries delivery
      where delivery.batch_id = notification_batches.id
        and (delivery.state = 'pending'
          or coalesce(delivery.sent_at, delivery.next_attempt_at, notification_batches.send_after)
            >= now() - interval '30 days'))`,
  );
}