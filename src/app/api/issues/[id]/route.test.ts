import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../server/db";
import { memberSummary } from "../../../../server/members";
import {
  comments,
  issueLabels,
  issues,
  labels,
  members,
  mentions,
  notificationEmails,
  notifications,
  projects,
} from "../../../../server/schema";
import { createSession } from "../../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { POST } from "../../projects/[key]/issues/route";
import { DELETE, GET, PATCH } from "./route";

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

function saveDescription(cookie: string, id: string, description: string, descriptionVersion: number) {
  return patchWith(cookie, id, { description, descriptionVersion });
}

function deleteWith(cookie: string, id: string) {
  return DELETE(jsonRequest("DELETE", `/api/issues/${id}`, undefined, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

async function mentionedMemberIds(issueId: string) {
  const rows = await db
    .select({ memberId: mentions.memberId })
    .from(mentions)
    .where(eq(mentions.issueId, issueId))
    .orderBy(asc(mentions.memberId));
  return rows.map((row) => row.memberId);
}

async function issueCreatedBy(project: { id: string; key: string }, creatorId: string) {
  const issue = await issueIn(project);
  await db.update(issues).set({ createdBy: creatorId }).where(eq(issues.id, issue.id));
  return issue;
}

it("REQ-022.1: Sam saves a description with a checklist and a code block → stored and returned as sent", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);
  const description = "- [ ] Reproduce\n- [x] Write a test\n\n```ts\nconst answer = 42;\n```";

  const response = await saveDescription(cookie, issue.displayId, description, 0);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ description, descriptionVersion: 1 });
  const after = await stored(issue.id);
  expect(after).toMatchObject({ description, descriptionVersion: 1 });
  expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
});

it("REQ-022: an empty issue description is allowed", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(issues).set({ description: "Old text" }).where(eq(issues.id, issue.id));

  const response = await saveDescription(cookie, issue.displayId, "", 0);

  expect(response.status).toBe(200);
  expect((await stored(issue.id)).description).toBe("");
});

it('REQ-022.2: a description of 20,001 characters gets "Too long (max 20,000)"', async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(issues).set({ description: "Old text" }).where(eq(issues.id, issue.id));

  const response = await saveDescription(cookie, issue.displayId, "a".repeat(20_001), 0);

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ description: "Too long (max 20,000)" }));
  expect(await stored(issue.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });
});

it("STD-8: a stale issue description save is refused with 409 naming who saved, and nothing is saved", async () => {
  const alex = await createMember({ fullName: "Alex Kim" });
  const alexCookie = `session=${await createSession(alex.id)}`;
  const samCookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  expect((await saveDescription(alexCookie, issue.displayId, "Alex's text", 0)).status).toBe(200);
  const response = await saveDescription(samCookie, issue.displayId, "Sam's text", 0);

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: { message: "This was changed by Alex Kim. Copy your text and reload." },
  });
  expect(await stored(issue.id)).toMatchObject({ description: "Alex's text", descriptionVersion: 1 });
});

it("STD-8: a status change by a teammate doesn't block a description save", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  expect((await patchWith(cookie, issue.displayId, { status: "in_progress" })).status).toBe(200);
  const response = await saveDescription(cookie, issue.displayId, "Still mine", 0);

  expect(response.status).toBe(200);
  expect(await stored(issue.id)).toMatchObject({ description: "Still mine", descriptionVersion: 1 });
});

it("STD-8: an issue description save without a whole-number descriptionVersion is refused", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  for (const body of [{ description: "New" }, { description: "New", descriptionVersion: "0" }]) {
    const response = await patchWith(cookie, issue.displayId, body);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { fields: { descriptionVersion: expect.any(String) } },
    });
  }
  expect((await stored(issue.id)).description).toBe("");
});

it("DATA-001: an issue description mentions active members only, outside code", async () => {
  const cookie = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const jo = await createMember({ deactivatedAt: new Date() });
  const coder = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  const description = `Can @${sam.username} help? Also @nobody-here, @${jo.username} and \`@${coder.username}\`.`;

  const response = await saveDescription(cookie, issue.displayId, description, 0);

  expect(response.status).toBe(200);
  expect(await mentionedMemberIds(issue.id)).toEqual([sam.id]);
  expect((await (await getWith(cookie, issue.displayId)).json()).mentions).toEqual([
    { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
  ]);
});

it("DATA-001: issue mention rows follow the current description text", async () => {
  const cookie = await signedIn();
  const sam = await createMember();
  const alex = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);

  await saveDescription(cookie, issue.displayId, `Hi @${sam.username}`, 0);
  const response = await saveDescription(cookie, issue.displayId, `Hi @${alex.username}`, 1);

  expect(response.status).toBe(200);
  expect(await mentionedMemberIds(issue.id)).toEqual([alex.id]);
});

it("REQ-007.4: Sam is deactivated while editing the description of WEB-42 → the save fails with 401 and nothing is saved", async () => {
  const sam = await createMember();
  const cookie = `session=${await createSession(sam.id)}`;
  const project = await createProject();
  const issue = await issueIn(project);
  await deactivate(sam.id);

  const response = await saveDescription(cookie, issue.displayId, "Sam's text", 0);

  expect(response.status).toBe(401);
  expect(await stored(issue.id)).toMatchObject({ description: "", descriptionVersion: 0 });
});

it("REQ-013.4: a description save to an issue in an archived project gets This project is archived", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  const response = await saveDescription(cookie, issue.displayId, "New text", 0);

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect((await stored(issue.id)).description).toBe("");
});

it("REQ-023.1: Sam deletes WEB-42, which Sam created → gone; opening WEB-42 shows Not found", async () => {
  const sam = await createMember();
  const cookie = `session=${await createSession(sam.id)}`;
  const project = await createProject();
  const issue = await issueCreatedBy(project, sam.id);

  const response = await deleteWith(cookie, issue.displayId.toLowerCase());

  expect(response.status).toBe(204);
  expect(await stored(issue.id)).toBeUndefined();
  const opened = await getWith(cookie, issue.displayId);
  expect(opened.status).toBe(404);
  expect(await opened.json()).toEqual({ error: { message: "Not found" } });
});

it("REQ-023: an admin deletes an issue someone else created", async () => {
  const admin = await createMember({ role: "admin" });
  const cookie = `session=${await createSession(admin.id)}`;
  const project = await createProject();
  const issue = await issueIn(project);

  const response = await deleteWith(cookie, issue.displayId);

  expect(response.status).toBe(204);
  expect(await stored(issue.id)).toBeUndefined();
});

it("REQ-023.2: Alex, a member, can't delete WEB-42, which Sam created", async () => {
  const sam = await createMember();
  const alexCookie = await signedIn();
  const project = await createProject();
  const issue = await issueCreatedBy(project, sam.id);

  const response = await deleteWith(alexCookie, issue.displayId);

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "You don't have permission to do that." } });
  expect(await stored(issue.id)).toBeDefined();
});

it("REQ-023.3: a save to WEB-42 after it's deleted gets This issue was deleted", async () => {
  const sam = await createMember();
  const samCookie = `session=${await createSession(sam.id)}`;
  const alexCookie = await signedIn();
  const project = await createProject();
  const issue = await issueCreatedBy(project, sam.id);

  expect((await deleteWith(samCookie, issue.displayId)).status).toBe(204);
  const response = await saveDescription(alexCookie, issue.displayId, "Alex's text", 0);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "This issue was deleted" } });
});

it("REQ-023: deleting an issue that's already gone gets This issue was deleted", async () => {
  const admin = await createMember({ role: "admin" });
  const cookie = `session=${await createSession(admin.id)}`;
  const project = await createProject();
  const issue = await issueIn(project);
  await db.delete(issues).where(eq(issues.id, issue.id));

  const response = await deleteWith(cookie, issue.displayId);

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "This issue was deleted" } });
});

it("REQ-023: a deleted issue's number is not reused", async () => {
  const sam = await createMember();
  const cookie = `session=${await createSession(sam.id)}`;
  const project = await createProject({ nextIssueNumber: 42 });
  const create = (title: string) =>
    POST(
      jsonRequest(
        "POST",
        `/api/projects/${project.key}/issues`,
        { requestId: randomUUID(), title },
        { Cookie: cookie },
      ),
      { params: Promise.resolve({ key: project.key }) },
    );

  const first = await (await create("First")).json();
  expect((await deleteWith(cookie, first.id)).status).toBe(204);
  const second = await (await create("Second")).json();

  expect(first.id).toBe(`${project.key}-42`);
  expect(second.id).toBe(`${project.key}-43`);
});

it("DATA-002: deleting WEB-42 takes its comments, mentions and label links with it; labels and notifications stay", async () => {
  const sam = await createMember();
  const cookie = `session=${await createSession(sam.id)}`;
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug" });
  const issue = await createIssue(project.id, [bug.id]);
  await db.update(issues).set({ createdBy: sam.id }).where(eq(issues.id, issue.id));
  const displayId = `${project.key}-${issue.number}`;
  const [comment] = await db
    .insert(comments)
    .values({ issueId: issue.id, authorId: sam.id, body: "Looks good", requestId: randomUUID() })
    .returning();
  await db.insert(mentions).values([
    { memberId: sam.id, issueId: issue.id },
    { memberId: sam.id, commentId: comment.id },
  ]);
  const [email] = await db
    .insert(notificationEmails)
    .values({
      recipientId: sam.id,
      targetType: "issue",
      targetId: issue.id,
      sendAfter: sql`now() + interval '2 minutes'`,
      state: "pending",
    })
    .returning();
  await db.insert(notifications).values({
    emailId: email.id,
    kind: "mentioned",
    actorId: sam.id,
    commentId: comment.id,
    issueRef: displayId,
    issueTitle: issue.title,
    projectName: project.name,
    projectKey: project.key,
    linkPath: `/issues/${displayId}`,
    excerpt: "Looks good",
  });

  const response = await deleteWith(cookie, displayId);

  expect(response.status).toBe(204);
  expect(await db.select().from(comments).where(eq(comments.issueId, issue.id))).toEqual([]);
  expect(await db.select().from(comments).where(eq(comments.id, comment.id))).toEqual([]);
  expect(await db.select().from(mentions).where(eq(mentions.memberId, sam.id))).toEqual([]);
  expect(await db.select().from(issueLabels).where(eq(issueLabels.issueId, issue.id))).toEqual([]);
  expect(await db.select().from(labels).where(eq(labels.id, bug.id))).toHaveLength(1);
  expect(await db.select().from(notificationEmails).where(eq(notificationEmails.id, email.id))).toHaveLength(
    1,
  );
  expect(await db.select().from(notifications).where(eq(notifications.emailId, email.id))).toHaveLength(1);
});

it("REQ-013.4: deleting an issue in an archived project gets This project is archived", async () => {
  const admin = await createMember({ role: "admin" });
  const cookie = `session=${await createSession(admin.id)}`;
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  const response = await deleteWith(cookie, issue.displayId);

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await stored(issue.id)).toBeDefined();
});