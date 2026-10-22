import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readConfig } from "./config";
import * as schema from "./schema";

export const db = drizzle(postgres(readConfig().databaseUrl, { onnotice: () => {} }), { schema });