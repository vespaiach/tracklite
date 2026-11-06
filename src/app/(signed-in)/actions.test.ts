import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { deleteProject } from "../../application/projects/delete-project";
import { ProjectKey } from "../../domain/shared/identifiers";
import { db } from "../../infrastructure/db";
import { createSession, sessionCookieName } from "../../infrastructure/identity/session";
import { projectWork } from "../../infrastructure/projects/project-work";
import { projects } from "../../infrastructure/projects/tables";
import { getProject, listProjects } from "../../queries";
import { createMember, createProject as createStored, uniqueProjectKey } from "../../test/factories";
import { setNextRequest } from "../../test/next-request";
import { createProject } from "./actions";

async function signedInAs(role: "admin" | "member", fullName?: string) {
  const member = await createMember({ role, ...(fullName ? { fullName } : {}) });
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
  return member;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

function fieldError(field: string, message: string) {
  return {
    ok: false,
    error: { kind: "invalid", message: "Check the highlighted fields", fields: { [field]: message } },
  };
}

it("REQ-009.1, REQ-009.2, REQ-009.5, REQ-046.2, REQ-046.4: an admin creates a project with a lowercase key, saved in uppercase and recorded as created by them; a second may reuse the name; the page is refreshed and the sidebar lists both", async () => {
  const alex = await signedInAs("admin", "Alex Kim");
  const key = uniqueProjectKey();
  const described = await createStored({ name: "Website", description: "Only on the details page" });

  expect(await createProject(form({ name: "Website", key: key.toLowerCase() }))).toEqual({
    ok: true,
    data: { key },
  });

  expect(refresh).toHaveBeenCalledOnce();
  expect(await getProject(alex, ProjectKey.from(key))).toMatchObject({
    key,
    name: "Website",
    description: "",
    archivedAt: null,
    createdBy: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
  });
  const listed = await listProjects(alex, false);
  expect(listed).toContainEqual({ key, name: "Website", archivedAt: null });
  expect(listed).toContainEqual({ key: described.key, name: "Website", archivedAt: null });
});

it("REQ-009.3: a key used by an active project, or one that has since been deleted, is refused beside the key", async () => {
  const admin = await signedInAs("admin");
  const active = await createStored();
  const deletedKey = uniqueProjectKey();
  await createProject(form({ name: "Website", key: deletedKey }));
  await deleteProject(admin, projectWork, ProjectKey.from(deletedKey));

  for (const key of [active.key.toLowerCase(), deletedKey]) {
    expect(await createProject(form({ name: "Website again", key }))).toEqual(
      fieldError("key", "Key already used"),
    );
  }
});

it("REQ-009.4, REQ-009: keys that aren't 2 to 5 letters and blank or long names are refused beside their fields; names are trimmed", async () => {
  await signedInAs("admin");

  for (const key of ["W", "WEB1", "ÉQ", "ABCDEF", ""]) {
    expect(await createProject(form({ name: "Website", key }))).toEqual(
      fieldError("key", "Key must be 2 to 5 letters"),
    );
  }
  expect(await createProject(form({ name: "   ", key: uniqueProjectKey() }))).toEqual(
    fieldError("name", "Name required"),
  );
  expect(await createProject(form({ name: "x".repeat(51), key: uniqueProjectKey() }))).toEqual(
    fieldError("name", "Too long (max 50)"),
  );

  const key = uniqueProjectKey();
  expect(await createProject(form({ name: `  ${"x".repeat(50)}  `, key }))).toMatchObject({ ok: true });
  const [stored] = await db.select().from(projects).where(eq(projects.key, key));
  expect(stored.name).toBe("x".repeat(50));
});

it("REQ-009: concurrent creates with the same key make exactly one project", async () => {
  await signedInAs("admin");
  const key = uniqueProjectKey();

  const results = await Promise.all([
    createProject(form({ name: "First", key })),
    createProject(form({ name: "Second", key })),
  ]);

  expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
  expect(await db.select().from(projects).where(eq(projects.key, key))).toHaveLength(1);
});