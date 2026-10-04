import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must be set to a database other than DATABASE_URL");
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`drop schema if exists drizzle cascade`;
    await client`drop schema public cascade`;
    await client`create schema public`;
    await migrate(drizzle(client), { migrationsFolder: "migrations" });
  } finally {
    await client.end();
  }
}