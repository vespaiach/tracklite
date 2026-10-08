import { runWorker } from "../src/server/worker";

const stop = new AbortController();
process.on("SIGTERM", () => stop.abort());
process.on("SIGINT", () => stop.abort());

await runWorker({ signal: stop.signal });
process.exit(0);