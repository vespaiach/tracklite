import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createProject } from "../test/factories";
import { db } from "./db";
import { createLabel } from "./labels";
import { labels } from "./schema";

async function waitForLockWaiters(count: number) {
  for (;;) {
    const [{ waiting }] = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

it("REQ-021.2: two concurrent creates of bug and BUG leave one label", async () => {
  const project = await createProject();
  let inserted!: () => void;
  let finishFirst!: () => void;
  const firstInserted = new Promise<void>((resolve) => {
    inserted = resolve;
  });
  const first = db.transaction(async (tx) => {
    await tx.insert(labels).values({ projectId: project.id, name: "bug", color: "red" });
    inserted();
    await new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
  });
  await firstInserted;

  const second = createLabel(project.key, { name: "BUG", color: "blue" });
  await waitForLockWaiters(1);
  finishFirst();
  await first;

  await expect(second).rejects.toMatchObject({ status: 422, fields: { name: "Label already exists" } });
  const stored = await db.select().from(labels).where(eq(labels.projectId, project.id));
  expect(stored.map((label) => label.name)).toEqual(["bug"]);
});