import type { NotificationStats } from "../../../contract";
import { apiRoute } from "../_route";
import { notificationStats } from "../../../queries";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await notificationStats(member)) satisfies NotificationStats),
);