import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/db";
import { memberSummary } from "../../../../server/members";
import { issueLabels, issues, members, projects } from "../../../../server/schema";
import { createSession } from "../../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { POST } from "../../projects/[key]/issues/route";
import { GET, PATCH } from "./route";

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

function getWith(cookie: string, id: string) {
  return GET(new Request(`http://localhost:3000/api/issues/${id}`, { headers: { Cookie: cookie } }), {
    params: Promise.resolve({ id }),
  });
}

function patchWith(cookie: string, id: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/issues/${id}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

async function issueIn(project: { id: string; key: string }) {
  const issue = await createIssue(project.id);
  return { ...issue, displayId: `${project.key}-${issue.number}` };
}

async function stored(issueId: string) {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  return issue;
}

async function ageTimestamps(issueId: string) {
  await db
    .update(issues)
    .set({
      updatedAt: sql`now() - interval '1 hour'`,
      statusChangedAt: sql`now() - interval '1 hour'`,
    })
    .where(eq(issues.id, issueId));
  return stored(issueId);
}

async function deactivate(memberId: string) {
  await db.update(members).set({ deactivatedAt: sql`now()` }).where(eq(members.id, memberId));
}

function fieldError(fields: Record<string, string>) {
  return { error: { message: "Check the highlighted fields", fields } };
}

it("REQ-016.5: GET /api/issues/web-42 returns WEB-42", async () => {
  const cookie = await signedIn();
  const project = await createProject({ nextIssueNumber: 42 });
  const created = await POST(
    jsonRequest(
      "POST",
      `/api/projects/${project.key}/issues`,
      { requestId: randomUUID(), title: "Fix login button" },
      { Cookie: cookie },
    ),
    { params: Promise.resolve({ key: project.key }) },
  );

  const response = await getWith(cookie, `${project.key.toLowerCase()}-42`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(await created.json());
});

it("REQ-016.5: an issue ID that doesn't exist gets Not found", async () => {
  const cookie = await signedIn();
  const project = await createProject();

  for (const id of [`${project.key}-999`, "nonsense", `${project.key}-0x1`]) {
    const response = await getWith(cookie, id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "Not found" } });
  }
});

it("REQ-020.1: GET returns the labels sorted by name, descriptionVersion and mentions", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const frontend = await createLabel(project.id, { name: "frontend", color: "blue" });
  const bug = await createLabel(project.id, { name: "Bug", color: "red" });
  const issue = await createIssue(project.id, [frontend.id, bug.id]);

  const response = await getWith(cookie, `${project.key}-${issue.number}`);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: `${project.key}-${issue.number}`,
    labels: [
      { id: bug.id, name: "Bug", color: "red" },
      { id: frontend.id, name: "frontend", color: "blue" },
    ],
    descriptionVersion: 0,
    mentions: [],
    archived: false,
  });
});

it("REQ-013.1: WEB-42 in an archived project still opens, marked archived", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const issue = await issueIn(project);

  const response = await getWith(cookie, issue.displayId);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: issue.displayId, archived: true });
});

it("REQ-017.1: WEB-42 is moved from Backlog straight to Done", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  const response = await patchWith(cookie, issue.displayId, { status: "done" });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("done");
  expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(before.updatedAt.getTime());
  const after = await stored(issue.id);
  expect(after.statusChangedAt.getTime()).toBeGreaterThan(before.statusChangedAt.getTime());
});

it("REQ-027.4: Alex changes WEB-12 to In Review on the issue page → it's at the top of In Review", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const first = await createIssue(project.id);
  const second = await createIssue(project.id);
  await db.update(issues).set({ status: "in_review" }).where(eq(issues.projectId, project.id));
  const issue = await issueIn(project);

  const response = await patchWith(cookie, issue.displayId, { status: "in_review" });

  expect(response.status).toBe(200);
  const column = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.projectId, project.id), eq(issues.status, "in_review")))
    .orderBy(asc(issues.position), asc(issues.id));
  expect(column.map((row) => row.id)).toEqual([issue.id, first.id, second.id]);
});

it("REQ-017.1: saving the status an issue already has changes nothing", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  const response = await patchWith(cookie, issue.displayId, { status: "backlog" });

  expect(response.status).toBe(200);
  const after = await stored(issue.id);
  expect(after.position).toBe(before.position);
  expect(after.updatedAt).toEqual(before.updatedAt);
  expect(after.statusChangedAt).toEqual(before.statusChangedAt);
});

it("REQ-018.1: Sam sets WEB-42 to Urgent → WEB-42 shows Urgent", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  const response = await patchWith(cookie, issue.displayId, { priority: "urgent" });

  expect(response.status).toBe(200);
  expect((await response.json()).priority).toBe("urgent");
  expect((await stored(issue.id)).priority).toBe("urgent");
});

it("REQ-019.1: Sam assigns WEB-42 to Alex → shows Alex", async () => {
  const cookie = await signedIn();
  const alex = await createMember({ fullName: "Alex Kim" });
  const project = await createProject();
  const issue = await issueIn(project);

  const response = await patchWith(cookie, issue.displayId, { assignee: alex.username.toUpperCase() });

  expect(response.status).toBe(200);
  expect((await response.json()).assignee).toEqual(memberSummary(alex));
  expect((await stored(issue.id)).assigneeId).toBe(alex.id);
});

it("REQ-019.2: Sam clears the assignee → shows Unassigned", async () => {
  const cookie = await signedIn();
  const alex = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(issues).set({ assigneeId: alex.id }).where(eq(issues.id, issue.id));

  const response = await patchWith(cookie, issue.displayId, { assignee: null });

  expect(response.status).toBe(200);
  expect((await response.json()).assignee).toBeNull();
  expect((await stored(issue.id)).assigneeId).toBeNull();
});

it("REQ-019: an unknown assignee gets Choose an active member", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  const response = await patchWith(cookie, issue.displayId, { assignee: "nobody-here" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ assignee: "Choose an active member" }));
});

it("REQ-020.1: Sam adds bug and frontend to WEB-42 → both shown", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug", color: "red" });
  const frontend = await createLabel(project.id, { name: "frontend", color: "blue" });
  const docs = await createLabel(project.id, { name: "docs", color: "gray" });
  const issue = await issueIn(project);
  await db.insert(issueLabels).values({ issueId: issue.id, labelId: docs.id });

  const response = await patchWith(cookie, issue.displayId, { labelIds: [frontend.id, bug.id] });

  expect(response.status).toBe(200);
  expect((await response.json()).labels).toEqual([
    { id: bug.id, name: "bug", color: "red" },
    { id: frontend.id, name: "frontend", color: "blue" },
  ]);
});

it("REQ-020.3: Sam tries to add an 11th label → Maximum 10 labels", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const ten = await Promise.all(Array.from({ length: 10 }, () => createLabel(project.id)));
  const eleventh = await createLabel(project.id);
  const issue = await issueIn(project);
  await patchWith(cookie, issue.displayId, { labelIds: ten.map((label) => label.id) });

  const response = await patchWith(cookie, issue.displayId, {
    labelIds: [...ten.map((label) => label.id), eleventh.id],
  });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ labelIds: "Maximum 10 labels" }));
  const kept = await db.select().from(issueLabels).where(eq(issueLabels.issueId, issue.id));
  expect(kept).toHaveLength(10);
});

it("REQ-020.4: Sam adds frontend just as it's deleted → That label no longer exists; other changes kept", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const otherProject = await createProject();
  const bug = await createLabel(project.id, { name: "bug" });
  const foreign = await createLabel(otherProject.id);
  const issue = await issueIn(project);
  await patchWith(cookie, issue.displayId, { title: "Renamed first" });

  for (const labelIds of [[bug.id, randomUUID()], [bug.id, foreign.id], ["not-a-uuid"]]) {
    const response = await patchWith(cookie, issue.displayId, { labelIds });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "That label no longer exists" } });
  }
  expect((await stored(issue.id)).title).toBe("Renamed first");
  expect(await db.select().from(issueLabels).where(eq(issueLabels.issueId, issue.id))).toEqual([]);
});

it("REQ-016.3: a title edit is trimmed, required and at most 200 characters", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  const saved = await patchWith(cookie, issue.displayId, { title: "  Fix login button  " });
  expect(saved.status).toBe(200);
  expect((await saved.json()).title).toBe("Fix login button");

  const blank = await patchWith(cookie, issue.displayId, { title: "   " });
  expect(blank.status).toBe(422);
  expect(await blank.json()).toEqual(fieldError({ title: "Title required" }));

  const long = await patchWith(cookie, issue.displayId, { title: "a".repeat(201) });
  expect(long.status).toBe(422);
  expect(await long.json()).toEqual(fieldError({ title: "Too long (max 200)" }));

  expect((await stored(issue.id)).title).toBe("Fix login button");
});

it("REQ-017: an unknown status or priority gets a field error", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  const status = await patchWith(cookie, issue.displayId, { status: "Blocked" });
  expect(status.status).toBe(422);
  expect(await status.json()).toEqual(fieldError({ status: "Choose a status" }));

  const priority = await patchWith(cookie, issue.displayId, { priority: "critical" });
  expect(priority.status).toBe(422);
  expect(await priority.json()).toEqual(fieldError({ priority: "Choose a priority" }));
});

it("a save must change exactly one field", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  for (const body of [{}, { title: "New", priority: "high" }, { color: "red" }]) {
    const response = await patchWith(cookie, issue.displayId, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Change one field at a time" } });
  }
  expect((await stored(issue.id)).title).toBe(issue.title);
});

it("REQ-007.2: WEB-42 assigned to deactivated Sam still shows Sam Lee (deactivated), and Sam can't be assigned", async () => {
  const cookie = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const project = await createProject();
  const issue = await issueIn(project);
  const other = await issueIn(project);
  await db.update(issues).set({ assigneeId: sam.id }).where(eq(issues.id, issue.id));
  await deactivate(sam.id);

  const shown = await getWith(cookie, issue.displayId);
  expect((await shown.json()).assignee).toEqual({ ...memberSummary(sam), deactivated: true });

  const assigned = await patchWith(cookie, other.displayId, { assignee: sam.username });
  expect(assigned.status).toBe(422);
  expect(await assigned.json()).toEqual(fieldError({ assignee: "Choose an active member" }));
  expect((await stored(other.id)).assigneeId).toBeNull();
});

it("REQ-008.2: after Sam is reactivated, (deactivated) disappears and Sam can be assigned again", async () => {
  const cookie = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const project = await createProject();
  const issue = await issueIn(project);
  const other = await issueIn(project);
  await db.update(issues).set({ assigneeId: sam.id }).where(eq(issues.id, issue.id));
  await deactivate(sam.id);
  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, sam.id));

  const shown = await getWith(cookie, issue.displayId);
  expect((await shown.json()).assignee).toEqual({ ...memberSummary(sam), deactivated: false });

  const assigned = await patchWith(cookie, other.displayId, { assignee: sam.username });
  expect(assigned.status).toBe(200);
  expect((await stored(other.id)).assigneeId).toBe(sam.id);
});

it("REQ-013.4: Sam's save to WEB-42 after WEB is archived fails with This project is archived", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  const response = await patchWith(cookie, issue.displayId, { title: "Changed while archived" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect((await stored(issue.id)).title).toBe(issue.title);
});

it("a save to a deleted issue gets This issue was deleted", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.delete(issues).where(eq(issues.id, issue.id));

  for (const id of [issue.displayId, "nonsense"]) {
    const response = await patchWith(cookie, id, { priority: "high" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "This issue was deleted" } });
  }
});