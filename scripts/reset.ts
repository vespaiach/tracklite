import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const localHosts = ["localhost", "127.0.0.1", "[::1]"];
const url = process.env.DATABASE_URL;

if (!url || !localHosts.includes(new URL(url).hostname)) {
  console.error("DATABASE_URL must point at a local database to reset it.");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await client`drop schema if exists drizzle cascade`;
  await client`drop schema if exists public cascade`;
  await client`create schema public`;
  await migrate(drizzle(client), { migrationsFolder: "migrations" });
  console.log(`Reset ${new URL(url).pathname.slice(1)} and applied migrations.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}