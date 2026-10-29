import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { logError } from "../src/server/shared/log";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL must be set to run migrations.");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "migrations" });
  console.log("Migrations applied.");
} catch (error) {
  logError("boot", "start-failed", error, { script: "migrate" });
  process.exitCode = 1;
} finally {
  await client.end();
}