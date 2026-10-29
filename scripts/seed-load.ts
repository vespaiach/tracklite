import { seedLoadData } from "../src/test/seed-load";
import { logError } from "../src/server/shared/log";

try {
  const { seeded } = await seedLoadData();
  console.log(
    seeded
      ? "Seeded load test data: 50 projects, 10,000 issues, 50,000 comments."
      : "Load test data is already seeded; nothing added.",
  );
  process.exit(0);
} catch (error) {
  logError("boot", "start-failed", error, { script: "seed-load" });
  process.exit(1);
}