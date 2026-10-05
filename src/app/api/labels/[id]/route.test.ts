import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/db";
import { issueLabels, issues, labels } from "../../../../server/schema";
import { createSession } from "../../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { DELETE, PATCH } from "./route";

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

function patchWith(cookie: string, id: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/labels/${id}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

function deleteWith(cookie: string, id: string) {
  return DELETE(jsonRequest("DELETE", `/api/labels/${id}`, undefined, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

async function storedLabel(id: string) {
  const [label] = await db.select().from(labels).where(eq(labels.id, id));
  return label;
}

async function labelNamesOf(issueId: string) {
  const rows = await db
    .select({ name: labels.name })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(eq(issueLabels.issueId, issueId))
    .orderBy(labels.name);
  return rows.map((row) => row.name);
}

async function storedIssues(ids: string[]) {
  return db.select().from(issues).where(inArray(issues.id, ids)).orderBy(issues.number);
}

const archived = { error: { message: "This project is archived" } };

it("REQ-021.1: renaming bug to defect shows defect on every issue that had it", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug", color: "red" });
  const ui = await createLabel(project.id, { name: "ui" });
  const first = await createIssue(project.id, [bug.id]);
  const second = await createIssue(project.id, [bug.id, ui.id]);
  const before = await storedIssues([first.id, second.id]);

  const response = await patchWith(cookie, bug.id, { name: " defect " });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: bug.id, name: "defect", color: "red", issueCount: 2 });
  expect(await labelNamesOf(first.id)).toEqual(["defect"]);
  expect(await labelNamesOf(second.id)).toEqual(["defect", "ui"]);
  expect(await storedIssues([first.id, second.id])).toEqual(before);
});

it("REQ-021: a label is recolored", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug", color: "red" });

  const response = await patchWith(cookie, bug.id, { color: "blue" });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: bug.id, name: "bug", color: "blue", issueCount: 0 });
  expect(await storedLabel(bug.id)).toMatchObject({ name: "bug", color: "blue" });
});

it("REQ-021.2: renaming to another label's name ignoring capitals is refused", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug" });
  const defect = await createLabel(project.id, { name: "defect" });

  const clash = await patchWith(cookie, defect.id, { name: "BUG" });
  const recased = await patchWith(cookie, bug.id, { name: "Bug" });

  expect(clash.status).toBe(422);
  expect(await clash.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { name: "Label already exists" } },
  });
  expect((await storedLabel(defect.id)).name).toBe("defect");
  expect(recased.status).toBe(200);
  expect((await storedLabel(bug.id)).name).toBe("Bug");
});

it("REQ-021: renaming to an empty name or an unknown color gets field errors", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug" });

  const response = await patchWith(cookie, bug.id, { name: "", color: "teal" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: {
      message: "Check the highlighted fields",
      fields: { name: "Name required", color: "Choose a color" },
    },
  });
  expect(await storedLabel(bug.id)).toMatchObject({ name: "bug", color: "gray" });
});

it("REQ-021.3: deleting frontend removes it from every issue and leaves the issues otherwise unchanged", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const frontend = await createLabel(project.id, { name: "frontend" });
  const bug = await createLabel(project.id, { name: "bug" });
  const first = await createIssue(project.id, [frontend.id]);
  const second = await createIssue(project.id, [frontend.id, bug.id]);
  const before = await storedIssues([first.id, second.id]);

  const response = await deleteWith(cookie, frontend.id);

  expect(response.status).toBe(204);
  expect(await storedLabel(frontend.id)).toBeUndefined();
  expect(await labelNamesOf(first.id)).toEqual([]);
  expect(await labelNamesOf(second.id)).toEqual(["bug"]);
  expect(await storedIssues([first.id, second.id])).toEqual(before);
});

it("REQ-013.6: renaming a label in an archived project is refused and the label is unchanged", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const bug = await createLabel(project.id, { name: "bug" });

  const response = await patchWith(cookie, bug.id, { name: "defect" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(archived);
  expect((await storedLabel(bug.id)).name).toBe("bug");
});

it("REQ-013.4: recoloring or deleting a label in an archived project is refused", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const bug = await createLabel(project.id, { name: "bug", color: "red" });

  const recolor = await patchWith(cookie, bug.id, { color: "blue" });
  const remove = await deleteWith(cookie, bug.id);

  expect(recolor.status).toBe(403);
  expect(await recolor.json()).toEqual(archived);
  expect(remove.status).toBe(403);
  expect(await remove.json()).toEqual(archived);
  expect(await storedLabel(bug.id)).toMatchObject({ name: "bug", color: "red" });
});

it("STD-4: a label that no longer exists gets That label no longer exists", async () => {
  const cookie = await signedIn();
  const gone = { error: { message: "That label no longer exists" } };

  const patch = await patchWith(cookie, randomUUID(), { name: "bug" });
  const remove = await deleteWith(cookie, randomUUID());
  const malformed = await patchWith(cookie, "not-a-uuid", { name: "bug" });

  expect(patch.status).toBe(404);
  expect(await patch.json()).toEqual(gone);
  expect(remove.status).toBe(404);
  expect(await remove.json()).toEqual(gone);
  expect(malformed.status).toBe(404);
});