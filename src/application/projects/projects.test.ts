import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember, createProject, uniqueProjectKey } from "../../test/factories";
import { db } from "../../infrastructure/db";
import { ProjectName } from "../../domain/projects/project-name";
import { drizzleProjectRepository } from "../../infrastructure/projects/drizzle-project-repository";
import type { Transaction } from "../../infrastructure/transaction";
import { projectWork } from "../../infrastructure/projects/project-work";
import { createProject as create } from "./create-project";
import { deleteProject } from "./delete-project";
import { updateProject } from "./update-project";
import { projects } from "../../infrastructure/projects/tables";
import { ProjectKey } from "../../domain/shared/identifiers";

const forbidden = { kind: "forbidden", message: "You don't have permission to do that." };

async function storedProject(id: string) {
  const [stored] = await db.select().from(projects).where(eq(projects.id, id));
  return stored;
}

async function holdWritable(tx: Transaction, key: string) {
  const project = await drizzleProjectRepository({ tx, saved: () => {} }).hold(ProjectKey.from(key));
  project?.assertWritable();
}

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

it("REQ-013.4: archiving waits for a write already under way, so that write can't land after it", async () => {
  const admin = await createMember({ role: "admin" });
  const project = await createProject();
  let writeChecked!: () => void;
  let finishWrite!: () => void;
  const checked = new Promise<void>((resolve) => {
    writeChecked = resolve;
  });
  const write = db.transaction(async (tx) => {
    await holdWritable(tx, project.key);
    writeChecked();
    await new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    await tx.update(projects).set({ description: "Saved" }).where(eq(projects.id, project.id));
  });
  await checked;

  const archive = updateProject(admin, projectWork, ProjectKey.from(project.key), { archived: true });
  await waitForLockWaiters(1);
  finishWrite();
  await write;
  await archive;

  const [stored] = await db.select().from(projects).where(eq(projects.id, project.id));
  expect(stored.description).toBe("Saved");
  expect(stored.archivedAt).not.toBeNull();
  await expect(db.transaction((tx) => holdWritable(tx, project.key))).rejects.toMatchObject({
    kind: "forbidden",
  });
});

it("SEC-006.1: a member deleting project WEB, or a missing project, gets 403 and WEB remains", async () => {
  const member = await createMember();
  const project = await createProject();

  await expect(deleteProject(member, projectWork, ProjectKey.from(project.key))).rejects.toMatchObject(
    forbidden,
  );
  await expect(deleteProject(member, projectWork, ProjectKey.from("NOPE"))).rejects.toMatchObject(forbidden);

  expect(await storedProject(project.id)).toBeDefined();
});

it("STD-2: a member can't create a project", async () => {
  const member = await createMember();
  const key = uniqueProjectKey();

  await expect(
    create(member, projectWork, { name: ProjectName.from("Website"), key: ProjectKey.from(key) }),
  ).rejects.toMatchObject(forbidden);

  expect(await db.select().from(projects).where(eq(projects.key, key))).toHaveLength(0);
});

it("STD-2: a member can't rename or archive a project", async () => {
  const member = await createMember();
  const project = await createProject({ name: "Website" });

  await expect(
    updateProject(member, projectWork, ProjectKey.from(project.key), { name: ProjectName.from("Renamed") }),
  ).rejects.toMatchObject(forbidden);
  await expect(
    updateProject(member, projectWork, ProjectKey.from(project.key), { archived: true }),
  ).rejects.toMatchObject(forbidden);

  expect(await storedProject(project.id)).toMatchObject({ name: "Website", archivedAt: null });
});