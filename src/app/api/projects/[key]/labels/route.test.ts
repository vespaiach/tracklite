import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/db";
import { labels } from "../../../../../server/schema";
import { createSession } from "../../../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { PATCH } from "../../../labels/[id]/route";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn() {
  const member = await createMember();
  return `session=${await createSession(member.id)}`;
}

function listWith(cookie: string, key: string) {
  return GET(
    new Request(`http://localhost:3000/api/projects/${key}/labels`, { headers: { Cookie: cookie } }),
    { params: Promise.resolve({ key }) },
  );
}

function createWith(cookie: string, key: string, body: unknown) {
  return POST(jsonRequest("POST", `/api/projects/${key}/labels`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

function renameWith(cookie: string, id: string, name: string) {
  return PATCH(jsonRequest("PATCH", `/api/labels/${id}`, { name }, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

async function labelsOf(projectId: string) {
  return db.select().from(labels).where(eq(labels.projectId, projectId));
}

function fieldError(fields: Record<string, string>) {
  return { error: { message: "Check the highlighted fields", fields } };
}

it("REQ-021.5: the label list shows how many issues have each label", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const frontend = await createLabel(project.id, { name: "frontend", color: "blue" });
  const bug = await createLabel(project.id, { name: "Bug", color: "red" });
  for (let i = 0; i < 12; i++) await createIssue(project.id, [frontend.id]);
  await createIssue(project.id, [frontend.id, bug.id]);
  await createIssue(project.id);

  const response = await listWith(cookie, project.key.toLowerCase());

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([
    { id: bug.id, name: "Bug", color: "red", issueCount: 1 },
    { id: frontend.id, name: "frontend", color: "blue", issueCount: 13 },
  ]);
});

it("REQ-021.2: creating BUG while bug exists is refused with Label already exists", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  await createLabel(project.id, { name: "bug" });

  const response = await createWith(cookie, project.key, { name: "BUG", color: "red" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ name: "Label already exists" }));
  expect(await labelsOf(project.id)).toHaveLength(1);
});

it("REQ-021.4: the same name in another project is a separate label", async () => {
  const cookie = await signedIn();
  const web = await createProject();
  const api = await createProject();
  const webBug = await createLabel(web.id, { name: "bug" });

  const response = await createWith(cookie, api.key, { name: "bug", color: "red" });

  expect(response.status).toBe(201);
  const apiBug = await response.json();
  expect(apiBug.id).not.toBe(webBug.id);
  expect((await renameWith(cookie, apiBug.id, "defect")).status).toBe(200);
  expect((await labelsOf(web.id)).map((label) => label.name)).toEqual(["bug"]);
  expect((await labelsOf(api.id)).map((label) => label.name)).toEqual(["defect"]);
});

it("REQ-021: a new label is created with a trimmed name and one of the 8 colors", async () => {
  const cookie = await signedIn();
  const project = await createProject();

  const response = await createWith(cookie, project.key, { name: "  bug ", color: "red" });

  expect(response.status).toBe(201);
  const created = await response.json();
  expect(created).toEqual({ id: expect.any(String), name: "bug", color: "red", issueCount: 0 });
  expect(await labelsOf(project.id)).toEqual([
    { id: created.id, projectId: project.id, name: "bug", color: "red" },
  ]);
});

it("REQ-021: an empty or too-long name and an unknown color get field errors", async () => {
  const cookie = await signedIn();
  const project = await createProject();

  const empty = await createWith(cookie, project.key, { name: "   ", color: "teal" });
  const tooLong = await createWith(cookie, project.key, { name: "x".repeat(31), color: "gray" });
  const longest = await createWith(cookie, project.key, { name: "x".repeat(30), color: "gray" });

  expect(empty.status).toBe(422);
  expect(await empty.json()).toEqual(fieldError({ name: "Name required", color: "Choose a color" }));
  expect(tooLong.status).toBe(422);
  expect(await tooLong.json()).toEqual(fieldError({ name: "Too long (max 30)" }));
  expect(longest.status).toBe(201);
});

it("REQ-013.5: an archived project's labels are still listed", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const bug = await createLabel(project.id, { name: "bug" });

  const response = await listWith(cookie, project.key);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([{ id: bug.id, name: "bug", color: "gray", issueCount: 0 }]);
});

it("REQ-013.4: creating a label in an archived project is refused with This project is archived", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });

  const response = await createWith(cookie, project.key, { name: "bug", color: "red" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await labelsOf(project.id)).toEqual([]);
});

it("STD-4: labels of an unknown project are Not found", async () => {
  const cookie = await signedIn();

  const list = await listWith(cookie, "NOPE");
  const create = await createWith(cookie, "NOPE", { name: "bug", color: "red" });

  expect(list.status).toBe(404);
  expect(await list.json()).toEqual({ error: { message: "Not found" } });
  expect(create.status).toBe(404);
});