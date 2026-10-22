import { receiveEmailEvent } from "../../../server/notifications";

export async function POST(request: Request) {
  const accepted = await receiveEmailEvent(request.headers, await request.text());
  return new Response(null, { status: accepted ? 200 : 401 });
}