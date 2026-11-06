import { workerIsHealthy } from "../../../queries";

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