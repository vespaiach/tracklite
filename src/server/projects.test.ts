import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember, createProject } from "../test/factories";
import { ApiError } from "./api-error";
import { db } from "./db";
import { updateProject, writableProject } from "./projects";
import { projects } from "./schema";

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

it("REQ-013.4: a write to an archived project is refused with This project is archived", async () => {
  const project = await createProject({ archivedAt: new Date() });

  const refusal = db.transaction((tx) => writableProject(tx, project.key.toLowerCase()));

  await expect(refusal).rejects.toThrow(ApiError);
  await expect(refusal).rejects.toMatchObject({ status: 403, message: "This project is archived" });
});

it("REQ-013.4: archiving waits for a write already under way, so that write can't land after it", async () => {
  const admin = await createMember({ role: "admin" });
  const project = await createProject();
  let writeChecked!: () => void;
  let finishWrite!: () => void;
  const checked = new Promise<void>((resolve) => {
    writeChecked = resolve;
  });
  const write = db.transaction(async (tx) => {
    await writableProject(tx, project.key);
    writeChecked();
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    await tx.update(projects).set({ description: "Saved" }).where(eq(projects.id, project.id));
  });
  await checked;

  const archive = updateProject(admin, project.key, { archived: true });
  await waitForLockWaiters(1);
  finishWrite();
  await write;
  await archive;

  const [stored] = await db.select().from(projects).where(eq(projects.id, project.id));
  expect(stored.description).toBe("Saved");
  expect(stored.archivedAt).not.toBeNull();
  await expect(db.transaction((tx) => writableProject(tx, project.key))).rejects.toMatchObject({
    status: 403,
  });
});

it("STD-4: a write to a missing project is Not found", async () => {
  await expect(db.transaction((tx) => writableProject(tx, "NOPE"))).rejects.toMatchObject({
    status: 404,
    message: "Not found",
  });
});