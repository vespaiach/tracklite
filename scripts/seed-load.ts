import { seedLoadData } from "../src/server/seed-load";

try {
  const { seeded } = await seedLoadData();
  console.log(
    seeded
      ? "Seeded load test data: 50 projects, 10,000 issues, 50,000 comments."
      : "Load test data is already seeded; nothing added.",
  );
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}