import "server-only";
import { type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "./db";

const chunkSize = 1_000;

export async function deleteInChunks(table: PgTable, expired: SQL) {
  let deleted: number;
  do {
    const result = await db.execute(sql`
      delete from ${table}
      where ctid in (select ctid from ${table} where ${expired} limit ${chunkSize})`);
    deleted = result.count;
  } while (deleted === chunkSize);
}