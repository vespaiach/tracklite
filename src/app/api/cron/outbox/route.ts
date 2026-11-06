import { isCronCall } from "../../../../infrastructure/notifications/cron-secret";
import { runOutbox } from "../../../../infrastructure/notifications/run-outbox";

const runBudgetMs = 50_000;

export async function POST(request: Request) {
  if (!isCronCall(request)) return new Response(null, { status: 401 });

  const deadline = performance.now() + runBudgetMs;
  const ran = await runOutbox(() => performance.now() < deadline);
  return new Response(null, { status: ran ? 204 : 500 });
}