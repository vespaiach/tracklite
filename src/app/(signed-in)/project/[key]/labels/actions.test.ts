import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { db } from "../../../../../infrastructure/db";
import { createSession, sessionCookieName } from "../../../../../infrastructure/identity/session";
import { issueLabels, issues } from "../../../../../infrastructure/issues/tables";
import { labels } from "../../../../../infrastructure/projects/tables";
import {
  createIssue,
  createLabel as storeLabel,
  createMember,
  createProject,
} from "../../../../../test/factories";
import { setNextRequest } from "../../../../../test/next-request";
import { createLabel, deleteLabel, updateLabel } from "./actions";

async function signedIn() {
  const member = await createMember();
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
  return member;
}

function labelForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

async function storedLabel(id: string) {
  const [label] = await db.select().from(labels).where(eq(labels.id, id));
  return label;
}

async function labelsOf(projectId: string) {
  return db.select().from(labels).where(eq(labels.projectId, projectId));
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

function fieldError(fields: Record<string, string>) {
  return { ok: false, error: { kind: "invalid", message: "Check the highlighted fields", fields } };
}

function refusal(kind: string, message: string) {
  return { ok: false, error: { kind, message } };
}

const done = { ok: true, data: null };
const archived = refusal("forbidden", "This project is archived");

it("REQ-021: a new label is created from the form with a trimmed name and one of the 8 colors, and the page is refreshed; an empty or too-long name and an unknown color get field errors", async () => {
  await signedIn();
  const project = await createProject();

  expect(await createLabel(labelForm({ key: project.key, name: "  bug ", color: "red" }))).toEqual(done);

  expect(refresh).toHaveBeenCalledOnce();
  expect(await labelsOf(project.id)).toEqual([
    { id: expect.any(String), projectId: project.id, name: "bug", color: "red" },
  ]);

  expect(await createLabel({ key: project.key, name: "   ", color: "teal" })).toEqual(
    fieldError({ name: "Name required", color: "Choose a color" }),
  );
  expect(await createLabel({ key: project.key, name: "x".repeat(31), color: "gray" })).toEqual(
    fieldError({ name: "Too long (max 30)" }),
  );
  expect(await createLabel({ key: project.key, name: "x".repeat(30), color: "gray" })).toEqual(done);
});

it("REQ-021.4: the same name in another project is a separate label", async () => {
  await signedIn();
  const web = await createProject();
  const api = await createProject();
  await storeLabel(web.id, { name: "bug" });

  expect(await createLabel({ key: api.key.toLowerCase(), name: "bug", color: "red" })).toEqual(done);
  const [apiBug] = await labelsOf(api.id);
  expect(await updateLabel({ id: apiBug.id, name: "defect" })).toEqual(done);

  expect((await labelsOf(web.id)).map((label) => label.name)).toEqual(["bug"]);
  expect((await labelsOf(api.id)).map((label) => label.name)).toEqual(["defect"]);
});

it("REQ-021.1, REQ-021: renaming bug to defect and recoloring it shows defect on every issue that had it, and the page is refreshed", async () => {
  await signedIn();
  const project = await createProject();
  const bug = await storeLabel(project.id, { name: "bug", color: "red" });
  const ui = await storeLabel(project.id, { name: "ui" });
  const first = await createIssue(project.id, [bug.id]);
  const second = await createIssue(project.id, [bug.id, ui.id]);
  const before = await storedIssues([first.id, second.id]);

  expect(await updateLabel(labelForm({ id: bug.id, name: " defect " }))).toEqual(done);
  expect(await updateLabel({ id: bug.id, color: "blue" })).toEqual(done);

  expect(refresh).toHaveBeenCalledTimes(2);
  expect(await storedLabel(bug.id)).toMatchObject({ name: "defect", color: "blue" });
  expect(await labelNamesOf(first.id)).toEqual(["defect"]);
  expect(await labelNamesOf(second.id)).toEqual(["defect", "ui"]);
  expect(await storedIssues([first.id, second.id])).toEqual(before);
});

it("REQ-021.2: renaming to another label's name ignoring capitals is refused", async () => {
  await signedIn();
  const project = await createProject();
  const bug = await storeLabel(project.id, { name: "bug" });
  const defect = await storeLabel(project.id, { name: "defect" });

  expect(await updateLabel({ id: defect.id, name: "BUG" })).toEqual(
    fieldError({ name: "Label already exists" }),
  );
  expect((await storedLabel(defect.id)).name).toBe("defect");

  expect(await updateLabel({ id: bug.id, name: "Bug" })).toEqual(done);
  expect((await storedLabel(bug.id)).name).toBe("Bug");
});

it("REQ-021: renaming to an empty name or an unknown color gets field errors", async () => {
  await signedIn();
  const project = await createProject();
  const bug = await storeLabel(project.id, { name: "bug" });

  expect(await updateLabel({ id: bug.id, name: "", color: "teal" })).toEqual(
    fieldError({ name: "Name required", color: "Choose a color" }),
  );
  expect(await storedLabel(bug.id)).toMatchObject({ name: "bug", color: "gray" });
});

it("REQ-021.3: deleting frontend removes it from every issue and leaves the issues otherwise unchanged", async () => {
  await signedIn();
  const project = await createProject();
  const frontend = await storeLabel(project.id, { name: "frontend" });
  const bug = await storeLabel(project.id, { name: "bug" });
  const first = await createIssue(project.id, [frontend.id]);
  const second = await createIssue(project.id, [frontend.id, bug.id]);
  const before = await storedIssues([first.id, second.id]);

  expect(await deleteLabel({ id: frontend.id })).toEqual(done);

  expect(refresh).toHaveBeenCalledOnce();
  expect(await storedLabel(frontend.id)).toBeUndefined();
  expect(await labelNamesOf(first.id)).toEqual([]);
  expect(await labelNamesOf(second.id)).toEqual(["bug"]);
  expect(await storedIssues([first.id, second.id])).toEqual(before);
});

it("REQ-013.6, REQ-013.4: creating, renaming, recoloring or deleting a label in an archived project is refused and nothing changes", async () => {
  await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const bug = await storeLabel(project.id, { name: "bug", color: "red" });

  expect(await createLabel({ key: project.key, name: "frontend", color: "red" })).toEqual(archived);
  expect(await updateLabel({ id: bug.id, name: "defect" })).toEqual(archived);
  expect(await updateLabel({ id: bug.id, color: "blue" })).toEqual(archived);
  expect(await deleteLabel({ id: bug.id })).toEqual(archived);

  expect(refresh).not.toHaveBeenCalled();
  expect(await labelsOf(project.id)).toEqual([expect.objectContaining({ name: "bug", color: "red" })]);
});

it("STD-4: a label that no longer exists gets That label no longer exists, and a label in an unknown project Not found", async () => {
  await signedIn();
  const gone = refusal("notFound", "That label no longer exists");

  expect(await updateLabel({ id: randomUUID(), name: "bug" })).toEqual(gone);
  expect(await deleteLabel({ id: randomUUID() })).toEqual(gone);
  expect(await updateLabel({ id: "not-a-uuid", name: "bug" })).toEqual(gone);
  expect(await createLabel({ key: "NOPE", name: "bug", color: "red" })).toEqual(
    refusal("notFound", "Not found"),
  );
});