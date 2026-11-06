import { outboxIsHealthy } from "../../../queries";

export async function GET() {
  try {
    return (await outboxIsHealthy()) ? new Response("ok") : unavailable();
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return new Response("unavailable", { status: 503 });
}