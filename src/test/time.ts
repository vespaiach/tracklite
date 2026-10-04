import { getTableColumns, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../server/db";

export async function moveIntoPast(column: PgColumn, id: string, interval: string) {
  const table = column.table as PgTable;
  const { id: idColumn } = getTableColumns(table);
  await db.execute(
    sql`update ${table} set ${sql.identifier(column.name)} = now() - ${interval}::interval where ${idColumn} = ${id}`,
  );
}