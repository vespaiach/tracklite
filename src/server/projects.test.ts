import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createMember, createProject, uniqueProjectKey } from "../test/factories";
import { ApiError } from "./api-error";
import { db } from "./db";
import { createProject as create, deleteProject, updateProject, writableProject } from "./projects";
import { members, projects } from "./schema";

const forbidden = { status: 403, message: "You don't have permission to do that." };

async function storedProject(id: string) {
  const [stored] = await db.select().from(projects).where(eq(projects.id, id));
  return stored;
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

it("SEC-006.1: a member deleting project WEB gets 403 and WEB remains", async () => {
  const member = await createMember();
  const project = await createProject();

  await expect(deleteProject(member, project.key)).rejects.toMatchObject(forbidden);

  expect(await storedProject(project.id)).toBeDefined();
});

it("SEC-006.1: a member deleting a missing project gets 403, not 404", async () => {
  const member = await createMember();

  await expect(deleteProject(member, "NOPE")).rejects.toMatchObject(forbidden);
});

it("STD-2: a member can't create a project", async () => {
  const member = await createMember();
  const key = uniqueProjectKey();

  await expect(create(member, { name: "Website", key })).rejects.toMatchObject(forbidden);

  expect(await db.select().from(projects).where(eq(projects.key, key))).toHaveLength(0);
});

it("STD-2: a member can't rename a project", async () => {
  const member = await createMember();
  const project = await createProject({ name: "Website" });

  await expect(updateProject(member, project.key, { name: "Renamed" })).rejects.toMatchObject(forbidden);

  expect((await storedProject(project.id)).name).toBe("Website");
});

it("STD-2: a member can't archive a project", async () => {
  const member = await createMember();
  const project = await createProject();

  await expect(updateProject(member, project.key, { archived: true })).rejects.toMatchObject(forbidden);

  expect((await storedProject(project.id)).archivedAt).toBeNull();
});

it("REQ-052.2: Jo, no longer an admin, saving a rename on project settings gets You don't have permission to do that.", async () => {
  const jo = await createMember({ role: "admin" });
  const project = await createProject({ name: "Website" });
  const [demoted] = await db.update(members).set({ role: "member" }).where(eq(members.id, jo.id)).returning();

  await expect(updateProject(demoted, project.key, { name: "Renamed" })).rejects.toMatchObject(forbidden);

  expect((await storedProject(project.id)).name).toBe("Website");
});

it("REQ-012: a member can still save a description through updateProject", async () => {
  const member = await createMember();
  const project = await createProject();

  const saved = await updateProject(member, project.key, { description: "# Goals", descriptionVersion: 0 });

  expect(saved.description).toBe("# Goals");
  expect((await storedProject(project.id)).description).toBe("# Goals");
});