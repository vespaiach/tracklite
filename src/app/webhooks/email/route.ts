import { receiveEmailEvent } from "../../../application/notifications/receive-email-event";
import { emailEventServices } from "../../../infrastructure/notifications/services";

export async function POST(request: Request) {
  const accepted = await receiveEmailEvent(emailEventServices, request.headers, await request.text());
  return new Response(null, { status: accepted ? 200 : 401 });
}