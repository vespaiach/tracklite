import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { projects } from "../../../server/schema";
import { createSession } from "../../../server/sessions";
import { createMember, createProject, uniqueProjectKey } from "../../../test/factories";
import { jsonRequest } from "../../../test/reset-links";
import { DELETE, PATCH } from "./[key]/route";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(role: "admin" | "member") {
  const member = await createMember({ role });
  return `session=${await createSession(member.id)}`;
}

function createWith(cookie: string, body: unknown) {
  return POST(jsonRequest("POST", "/api/projects", body, { Cookie: cookie }));
}

async function listWith(cookie: string, archived: boolean): Promise<{ key: string; name: string }[]> {
  const response = await GET(
    new Request(`http://localhost:3000/api/projects?archived=${archived}`, { headers: { Cookie: cookie } }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function patchWith(cookie: string, key: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/projects/${key}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

function deleteWith(cookie: string, key: string) {
  return DELETE(jsonRequest("DELETE", `/api/projects/${key}`, undefined, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

function keyError(message: string) {
  return { error: { message: "Check the highlighted fields", fields: { key: message } } };
}

function nameError(message: string) {
  return { error: { message: "Check the highlighted fields", fields: { name: message } } };
}

it("REQ-009.1: an admin creates a project and every member sees it", async () => {
  const adminCookie = await signedIn("admin");
  const memberCookie = await signedIn("member");
  const key = uniqueProjectKey();

  const response = await createWith(adminCookie, { name: "Website", key });

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    key,
    name: "Website",
    description: "",
    descriptionVersion: 0,
    mentions: [],
    archivedAt: null,
  });
  expect(await listWith(memberCookie, false)).toContainEqual({ key, name: "Website", archivedAt: null });
});

it("REQ-009.2: a lowercase key is saved in uppercase", async () => {
  const adminCookie = await signedIn("admin");
  const key = uniqueProjectKey();

  const response = await createWith(adminCookie, { name: "Website", key: key.toLowerCase() });

  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ key });
  const [stored] = await db.select().from(projects).where(eq(projects.key, key));
  expect(stored.name).toBe("Website");
});

it("REQ-009.3: a key used by a project that has since been deleted is refused", async () => {
  const adminCookie = await signedIn("admin");
  const key = uniqueProjectKey();
  await createWith(adminCookie, { name: "Website", key });
  expect((await deleteWith(adminCookie, key)).status).toBe(204);

  const response = await createWith(adminCookie, { name: "Website again", key });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(keyError("Key already used"));
});

it("REQ-009.3: a key used by an active project is refused", async () => {
  const adminCookie = await signedIn("admin");
  const { key } = await createProject();

  const response = await createWith(adminCookie, { name: "Website", key: key.toLowerCase() });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(keyError("Key already used"));
});

it("REQ-009.4: keys that aren't 2 to 5 letters are refused", async () => {
  const adminCookie = await signedIn("admin");

  for (const key of ["W", "WEB1", "ÉQ", "ABCDEF", "", 42]) {
    const response = await createWith(adminCookie, { name: "Website", key });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(keyError("Key must be 2 to 5 letters"));
  }
});

it("REQ-009.5: a second project may reuse a name with a different key", async () => {
  const adminCookie = await signedIn("admin");

  const first = await createWith(adminCookie, { name: "Website", key: uniqueProjectKey() });
  const second = await createWith(adminCookie, { name: "Website", key: uniqueProjectKey() });

  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
});

it("REQ-009: names are trimmed and must be 1 to 50 characters", async () => {
  const adminCookie = await signedIn("admin");

  const blank = await createWith(adminCookie, { name: "   ", key: uniqueProjectKey() });
  expect(blank.status).toBe(422);
  expect(await blank.json()).toEqual(nameError("Name required"));

  const long = await createWith(adminCookie, { name: "x".repeat(51), key: uniqueProjectKey() });
  expect(long.status).toBe(422);
  expect(await long.json()).toEqual(nameError("Too long (max 50)"));

  const trimmed = await createWith(adminCookie, { name: `  ${"x".repeat(50)}  `, key: uniqueProjectKey() });
  expect(trimmed.status).toBe(201);
  expect(await trimmed.json()).toMatchObject({ name: "x".repeat(50) });
});

it("REQ-009: concurrent creates with the same key make exactly one project", async () => {
  const adminCookie = await signedIn("admin");
  const key = uniqueProjectKey();

  const responses = await Promise.all([
    createWith(adminCookie, { name: "First", key }),
    createWith(adminCookie, { name: "Second", key }),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
  expect(await db.select().from(projects).where(eq(projects.key, key))).toHaveLength(1);
});

it("STD-2: a member can't create a project", async () => {
  const memberCookie = await signedIn("member");
  const key = uniqueProjectKey();

  const response = await createWith(memberCookie, { name: "Website", key });

  expect(response.status).toBe(403);
  expect(await db.select().from(projects).where(eq(projects.key, key))).toHaveLength(0);
});

it("REQ-013.1: archiving moves a project from the sidebar list to the Archived list", async () => {
  const adminCookie = await signedIn("admin");
  const memberCookie = await signedIn("member");
  const { key } = await createProject();

  expect((await patchWith(adminCookie, key, { archived: true })).status).toBe(200);

  expect((await listWith(memberCookie, false)).map((project) => project.key)).not.toContain(key);
  const archived = await listWith(memberCookie, true);
  expect(archived.find((project) => project.key === key)).toMatchObject({ archivedAt: expect.any(String) });
});

it("REQ-013.3: unarchiving puts a project back in the sidebar list", async () => {
  const adminCookie = await signedIn("admin");
  const memberCookie = await signedIn("member");
  const { key } = await createProject();
  await patchWith(adminCookie, key, { archived: true });

  expect((await patchWith(adminCookie, key, { archived: false })).status).toBe(200);

  expect((await listWith(memberCookie, false)).map((project) => project.key)).toContain(key);
  expect((await listWith(memberCookie, true)).map((project) => project.key)).not.toContain(key);
});

it("REQ-013: the Archived list is empty when no project is archived", async () => {
  const memberCookie = await signedIn("member");
  await db.delete(projects);

  expect(await listWith(memberCookie, true)).toEqual([]);
});

it("REQ-046.2: the project list carries no description", async () => {
  const cookie = await signedIn("member");
  const project = await createProject({ description: "Only on the details page" });

  const listed = (await listWith(cookie, false)).find((row) => row.key === project.key);

  expect(listed).toEqual({ key: project.key, name: project.name, archivedAt: null });
});