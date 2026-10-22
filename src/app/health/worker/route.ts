import { workerIsHealthy } from "../../../server/notifications";

export async function GET() {
  try {
    return (await workerIsHealthy()) ? new Response("ok") : unavailable();
  } catch {
    return unavailable();
  }
}

function unavailable() {
  return new Response("unavailable", { status: 503 });
}