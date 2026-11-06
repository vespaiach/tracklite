import { runWorker } from "../src/infrastructure/notifications/run-worker";
import { logError } from "../src/infrastructure/log";

const stop = new AbortController();
process.on("SIGTERM", () => stop.abort());
process.on("SIGINT", () => stop.abort());

try {
  await runWorker({ signal: stop.signal });
  process.exit(0);
} catch (error) {
  logError("boot", "start-failed", error, { script: "worker" });
  process.exit(1);
}