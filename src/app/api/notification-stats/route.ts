import type { NotificationStats } from "../../../contract";
import { apiRoute } from "../../../server/shared/api-route";
import { notificationStats } from "../../../server/notifications";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await notificationStats(member)) satisfies NotificationStats),
);