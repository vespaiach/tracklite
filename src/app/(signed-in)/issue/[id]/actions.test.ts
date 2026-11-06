import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { createIssue as createIssueUseCase } from "../../../../application/issues/create-issue";
import { IssueStatus } from "../../../../domain/issues/issue-status";
import { IssueTitle } from "../../../../domain/issues/issue-title";
import { memberSummary } from "../../../../domain/identity/member-summary";
import { IssueId, ProjectKey, RequestId } from "../../../../domain/shared/identifiers";
import { comments } from "../../../../infrastructure/comments/tables";
import { db } from "../../../../infrastructure/db";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { type Member, members } from "../../../../infrastructure/identity/tables";
import { issueWork } from "../../../../infrastructure/issues/issue-work";
import { issueAssignees, issueLabels, issues } from "../../../../infrastructure/issues/tables";
import {
  mentions,
  notificationBatches,
  notificationDeliveries,
  notifications,
} from "../../../../infrastructure/notifications/tables";
import { labels, projects } from "../../../../infrastructure/projects/tables";
import { findIssueById, updatedIssue } from "../../../../queries";
import {
  createIssue,
  createLabel,
  createMember,
  createNotificationBatch,
  createProject,
} from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import { deleteIssue, postComment, updateIssue } from "./actions";

type Result = { ok: true; data: unknown } | { ok: false; error: { message: string } };

async function signedIn(overrides: Parameters<typeof createMember>[0] = {}) {
  const member = await createMember(overrides);
  await startSessionFor(member);
  return member;
}

async function startSessionFor(member: Member) {
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
}

function saved<Data>(result: { ok: true; data: Data } | { ok: false; error: { message: string } }) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

async function issueIn(project: { id: string; key: string }, assigneeIds: string[] = []) {
  const issue = await createIssue(project.id, [], assigneeIds);
  return { ...issue, displayId: `${project.key}-${issue.number}` };
}

async function stored(issueId: string) {
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  return issue;
}

async function storedAssignees(issueId: string) {
  const rows = await db
    .select({ memberId: issueAssignees.memberId })
    .from(issueAssignees)
    .where(eq(issueAssignees.issueId, issueId));
  return rows.map((row) => row.memberId);
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

async function createIssueBy(actor: Member, key: string, title: string) {
  const { issueId } = await createIssueUseCase(actor, issueWork, ProjectKey.from(key), {
    requestId: RequestId.from(randomUUID()),
    title: IssueTitle.from(title),
    status: IssueStatus.from("backlog"),
    assignees: [],
  });
  return updatedIssue(db, issueId);
}

function fieldError(fields: Record<string, string>) {
  return { ok: false, error: { kind: "invalid", message: "Check the highlighted fields", fields } };
}

function refusal(kind: string, message: string) {
  return { ok: false, error: { kind, message } };
}

function saveDescription(id: string, description: string, descriptionVersion: number) {
  return updateIssue({ id, description, descriptionVersion });
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

function storedComments(issueId: string) {
  return db.select().from(comments).where(eq(comments.issueId, issueId)).orderBy(asc(comments.createdAt));
}

it("REQ-017.1: WEB-42 is moved from Backlog straight to Done, and the page is refreshed", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  const body = saved(await updateIssue({ id: issue.displayId, status: "done" }));

  expect(refresh).toHaveBeenCalledOnce();
  expect(body.status).toBe("done");
  expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(before.updatedAt.getTime());
  const after = await stored(issue.id);
  expect(after.statusChangedAt.getTime()).toBeGreaterThan(before.statusChangedAt.getTime());
});

it("REQ-027.4: Alex changes WEB-12 to In Review on the issue page → it's at the top of In Review", async () => {
  await signedIn();
  const project = await createProject();
  const first = await createIssue(project.id);
  const second = await createIssue(project.id);
  await db.update(issues).set({ status: "in_review" }).where(eq(issues.projectId, project.id));
  const issue = await issueIn(project);

  expect(await updateIssue({ id: issue.displayId, status: "in_review" })).toMatchObject({ ok: true });

  const column = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.projectId, project.id), eq(issues.status, "in_review")))
    .orderBy(asc(issues.position), asc(issues.id));
  expect(column.map((row) => row.id)).toEqual([issue.id, first.id, second.id]);
});

it("REQ-017: saving the status an issue already has changes nothing", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  expect(await updateIssue({ id: issue.displayId, status: "backlog" })).toMatchObject({ ok: true });

  const after = await stored(issue.id);
  expect(after.position).toBe(before.position);
  expect(after.updatedAt).toEqual(before.updatedAt);
  expect(after.statusChangedAt).toEqual(before.statusChangedAt);
});

it("REQ-018.1: Sam sets WEB-42 to Urgent → WEB-42 shows Urgent", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  expect(saved(await updateIssue({ id: issue.displayId, priority: "urgent" })).priority).toBe("urgent");
  expect((await stored(issue.id)).priority).toBe("urgent");
});

it("REQ-019.1, REQ-019.2, REQ-019.3, REQ-019.4, REQ-019: Sam assigns, adds, removes and clears assignees, shown sorted by name, with no maximum", async () => {
  await signedIn();
  const alex = await createMember({ fullName: "Alex Kim" });
  const jo = await createMember({ fullName: "Jo Park" });
  const project = await createProject();
  const issue = await issueIn(project);
  const assign = async (assignees: string[]) =>
    saved(await updateIssue({ id: issue.displayId, assignees })).assignees;

  expect(await assign([jo.username.toUpperCase()])).toEqual([memberSummary(jo)]);
  expect(await assign([jo.username, alex.username])).toEqual([memberSummary(alex), memberSummary(jo)]);
  expect(await assign([jo.username])).toEqual([memberSummary(jo)]);
  expect(await storedAssignees(issue.id)).toEqual([jo.id]);

  const team = await Promise.all(Array.from({ length: 15 }, () => createMember()));
  expect(await assign(team.map((member) => member.username))).toHaveLength(15);

  expect(await assign([])).toEqual([]);
  expect(await storedAssignees(issue.id)).toEqual([]);
});

it("REQ-020.1: Sam adds bug and frontend to WEB-42 → both shown", async () => {
  await signedIn();
  const project = await createProject();
  const bug = await createLabel(project.id, { name: "bug", color: "red" });
  const frontend = await createLabel(project.id, { name: "frontend", color: "blue" });
  const docs = await createLabel(project.id, { name: "docs", color: "gray" });
  const issue = await issueIn(project);
  await db.insert(issueLabels).values({ issueId: issue.id, labelId: docs.id });

  const body = saved(await updateIssue({ id: issue.displayId, labelIds: [frontend.id, bug.id] }));

  expect(body.labels).toEqual([
    { id: bug.id, name: "bug", color: "red" },
    { id: frontend.id, name: "frontend", color: "blue" },
  ]);
});

it("REQ-020.3: Sam tries to add an 11th label → Maximum 10 labels", async () => {
  await signedIn();
  const project = await createProject();
  const ten = await Promise.all(Array.from({ length: 10 }, () => createLabel(project.id)));
  const eleventh = await createLabel(project.id);
  const issue = await issueIn(project);
  await updateIssue({ id: issue.displayId, labelIds: ten.map((label) => label.id) });

  expect(
    await updateIssue({ id: issue.displayId, labelIds: [...ten.map((label) => label.id), eleventh.id] }),
  ).toEqual(fieldError({ labelIds: "Maximum 10 labels" }));
  const kept = await db.select().from(issueLabels).where(eq(issueLabels.issueId, issue.id));
  expect(kept).toHaveLength(10);
});

it("REQ-020.4: Sam adds frontend just as it's deleted → That label no longer exists; other changes kept", async () => {
  await signedIn();
  const project = await createProject();
  const otherProject = await createProject();
  const bug = await createLabel(project.id, { name: "bug" });
  const foreign = await createLabel(otherProject.id);
  const issue = await issueIn(project);
  await updateIssue({ id: issue.displayId, title: "Renamed first" });

  for (const labelIds of [[bug.id, randomUUID()], [bug.id, foreign.id], ["not-a-uuid"]]) {
    expect(await updateIssue({ id: issue.displayId, labelIds })).toEqual(
      refusal("notFound", "That label no longer exists"),
    );
  }
  expect((await stored(issue.id)).title).toBe("Renamed first");
  expect(await db.select().from(issueLabels).where(eq(issueLabels.issueId, issue.id))).toEqual([]);
});

it("REQ-016.3, REQ-017: a title edit is trimmed, required and at most 200 characters; an unknown status or priority gets a field error", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  expect(saved(await updateIssue({ id: issue.displayId, title: "  Fix login button  " })).title).toBe(
    "Fix login button",
  );
  expect(await updateIssue({ id: issue.displayId, title: "   " })).toEqual(
    fieldError({ title: "Title required" }),
  );
  expect(await updateIssue({ id: issue.displayId, title: "a".repeat(201) })).toEqual(
    fieldError({ title: "Too long (max 200)" }),
  );
  expect((await stored(issue.id)).title).toBe("Fix login button");

  expect(await updateIssue({ id: issue.displayId, status: "Blocked" })).toEqual(
    fieldError({ status: "Choose a status" }),
  );
  expect(await updateIssue({ id: issue.displayId, priority: "critical" })).toEqual(
    fieldError({ priority: "Choose a priority" }),
  );
});

it("§3.3: a save must change exactly one field", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const bodies = [
    {},
    { title: "New", priority: "high" },
    { color: "red" },
    { description: "New text", descriptionVersion: 0, title: "New title" },
  ];

  for (const body of bodies) {
    expect(await updateIssue({ id: issue.displayId, ...body })).toEqual(
      refusal("invalid", "Change one field at a time"),
    );
  }
  expect(await stored(issue.id)).toMatchObject({
    title: issue.title,
    description: issue.description,
    descriptionVersion: 0,
  });
});

it("REQ-019.5, REQ-019.6, REQ-007.2, REQ-008.2: adding an unknown or deactivated member gets Choose an active member and saves nothing; deactivated Sam stays when Jo is added, shown (deactivated) until reactivated", async () => {
  const me = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const jo = await createMember({ fullName: "Jo Park" });
  const project = await createProject();
  const issue = await issueIn(project, [sam.id]);
  const other = await issueIn(project, [jo.id]);
  await deactivate(sam.id);

  for (const assignees of [[jo.username, "nobody-here"], [jo.username, sam.username], "nobody", [42]]) {
    expect(await updateIssue({ id: other.displayId, assignees })).toEqual(
      fieldError({ assignees: "Choose an active member" }),
    );
  }
  expect(await storedAssignees(other.id)).toEqual([jo.id]);

  expect(
    saved(await updateIssue({ id: issue.displayId, assignees: [sam.username, jo.username] })).assignees,
  ).toEqual([memberSummary(jo), { ...memberSummary(sam), deactivated: true }]);

  await db.update(members).set({ deactivatedAt: null }).where(eq(members.id, sam.id));

  expect((await findIssueById(me, IssueId.from(issue.displayId)))?.assignees).toContainEqual({
    ...memberSummary(sam),
    deactivated: false,
  });
  expect(await updateIssue({ id: other.displayId, assignees: [jo.username, sam.username] })).toMatchObject({
    ok: true,
  });
  expect(await storedAssignees(other.id)).toHaveLength(2);
});

it("REQ-013.4: on an archived project, a field save, a description save and a delete each get This project is archived", async () => {
  await signedIn({ role: "admin" });
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  const results: Result[] = [
    await updateIssue({ id: issue.displayId, title: "Changed while archived" }),
    await saveDescription(issue.displayId, "New text", 0),
    await deleteIssue({ id: issue.displayId }),
  ];

  for (const result of results) expect(result).toEqual(refusal("forbidden", "This project is archived"));
  expect(await stored(issue.id)).toMatchObject({ title: issue.title, description: "" });
});

it("REQ-023.3: a field save, a description save and a delete on a deleted issue get This issue was deleted", async () => {
  await signedIn({ role: "admin" });
  const project = await createProject();
  const issue = await issueIn(project);
  await db.delete(issues).where(eq(issues.id, issue.id));

  const results: Result[] = [
    await updateIssue({ id: issue.displayId, priority: "high" }),
    await updateIssue({ id: "nonsense", priority: "high" }),
    await saveDescription(issue.displayId, "Alex's text", 0),
    await deleteIssue({ id: issue.displayId }),
  ];

  for (const result of results) expect(result).toEqual(refusal("notFound", "This issue was deleted"));
});

it("REQ-022.1, REQ-022: Sam saves a description with a checklist and a code block → stored and returned as sent; an empty description is allowed", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);
  const description = "- [ ] Reproduce\n- [x] Write a test\n\n```ts\nconst answer = 42;\n```";

  expect(saved(await saveDescription(issue.displayId, description, 0))).toMatchObject({
    description,
    descriptionVersion: 1,
  });
  const after = await stored(issue.id);
  expect(after).toMatchObject({ description, descriptionVersion: 1 });
  expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());

  expect(await saveDescription(issue.displayId, "", 1)).toMatchObject({ ok: true });
  expect((await stored(issue.id)).description).toBe("");
});

it('REQ-022.2, STD-8: a description of 20,001 characters gets "Too long (max 20,000)", one without a whole-number descriptionVersion is refused, and nothing is saved', async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.update(issues).set({ description: "Old text" }).where(eq(issues.id, issue.id));

  expect(await saveDescription(issue.displayId, "a".repeat(20_001), 0)).toEqual(
    fieldError({ description: "Too long (max 20,000)" }),
  );

  for (const body of [{ description: "New" }, { description: "New", descriptionVersion: "0" }]) {
    expect(await updateIssue({ id: issue.displayId, ...body })).toMatchObject({
      ok: false,
      error: { kind: "invalid", fields: { descriptionVersion: expect.any(String) } },
    });
  }
  expect(await stored(issue.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });
});

it("STD-8: a stale issue description save is refused with a conflict naming who saved, and nothing is saved", async () => {
  await signedIn({ fullName: "Alex Kim" });
  const sam = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);

  expect(await saveDescription(issue.displayId, "Alex's text", 0)).toMatchObject({ ok: true });
  await startSessionFor(sam);

  expect(await saveDescription(issue.displayId, "Sam's text", 0)).toEqual(
    refusal("conflict", "This was changed by Alex Kim. Copy your text and reload."),
  );
  expect(await stored(issue.id)).toMatchObject({ description: "Alex's text", descriptionVersion: 1 });
});

it("STD-8: a status change by a teammate doesn't block a description save", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  expect(await updateIssue({ id: issue.displayId, status: "in_progress" })).toMatchObject({ ok: true });

  expect(await saveDescription(issue.displayId, "Still mine", 0)).toMatchObject({ ok: true });
  expect(await stored(issue.id)).toMatchObject({ description: "Still mine", descriptionVersion: 1 });
});

it("DATA-001.3, DATA-001: an issue description mentions active members only, outside code, and the rows follow the current text", async () => {
  const me = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const jo = await createMember({ deactivatedAt: new Date() });
  const coder = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  const description = `Can @${sam.username} help? Also @nobody-here, @${jo.username} and \`@${coder.username}\`.`;

  expect(await saveDescription(issue.displayId, description, 0)).toMatchObject({ ok: true });

  expect(await mentionedMemberIds(issue.id)).toEqual([sam.id]);
  expect((await findIssueById(me, IssueId.from(issue.displayId)))?.mentions).toEqual([
    { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
  ]);

  const alex = await createMember();
  expect(await saveDescription(issue.displayId, `Hi @${alex.username}`, 1)).toMatchObject({ ok: true });
  expect(await mentionedMemberIds(issue.id)).toEqual([alex.id]);
});

it("REQ-023.1: Sam deletes WEB-42, which Sam created → gone; opening WEB-42 shows Not found", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const issue = await issueCreatedBy(project, sam.id);

  expect(await deleteIssue({ id: issue.displayId.toLowerCase() })).toEqual({ ok: true, data: null });

  expect(await stored(issue.id)).toBeUndefined();
  expect(await findIssueById(sam, IssueId.from(issue.displayId))).toBeNull();
});

it("REQ-023.2, REQ-023: Alex, a member, can't delete WEB-42, which Sam created; an admin can", async () => {
  const sam = await createMember();
  await signedIn();
  const admin = await createMember({ role: "admin" });
  const project = await createProject();
  const issue = await issueCreatedBy(project, sam.id);

  expect(await deleteIssue({ id: issue.displayId })).toEqual(
    refusal("forbidden", "You don't have permission to do that."),
  );
  expect(await stored(issue.id)).toBeDefined();

  await startSessionFor(admin);
  expect(await deleteIssue({ id: issue.displayId })).toMatchObject({ ok: true });
  expect(await stored(issue.id)).toBeUndefined();
});

it("REQ-023: a deleted issue's number is not reused", async () => {
  const sam = await signedIn();
  const project = await createProject({ nextIssueNumber: 42 });

  const first = await createIssueBy(sam, project.key, "First");
  expect(await deleteIssue({ id: first.id })).toMatchObject({ ok: true });
  const second = await createIssueBy(sam, project.key, "Second");

  expect(first.id).toBe(`${project.key}-42`);
  expect(second.id).toBe(`${project.key}-43`);
});

it("DATA-002: deleting WEB-42 takes its comments, mentions and label links with it; labels and notifications stay", async () => {
  const sam = await signedIn();
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
  const { batch, delivery } = await createNotificationBatch({
    recipientId: sam.id,
    targetType: "issue",
    targetId: issue.id,
    sendAfter: sql`now() + interval '2 minutes'`,
  });
  await db.insert(notifications).values({
    batchId: batch.id,
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

  expect(await deleteIssue({ id: displayId })).toMatchObject({ ok: true });

  expect(await db.select().from(comments).where(eq(comments.issueId, issue.id))).toEqual([]);
  expect(await db.select().from(comments).where(eq(comments.id, comment.id))).toEqual([]);
  expect(await db.select().from(mentions).where(eq(mentions.memberId, sam.id))).toEqual([]);
  expect(await db.select().from(issueLabels).where(eq(issueLabels.issueId, issue.id))).toEqual([]);
  expect(await db.select().from(labels).where(eq(labels.id, bug.id))).toHaveLength(1);
  expect(
    await db.select().from(notificationBatches).where(eq(notificationBatches.id, batch.id)),
  ).toHaveLength(1);
  expect(
    await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, delivery.id)),
  ).toHaveLength(1);
  expect(await db.select().from(notifications).where(eq(notifications.batchId, batch.id))).toHaveLength(1);
});

it('REQ-031.1, REQ-031: Sam posts "Looks good. @alex can you review?" on WEB-42, and a comment starting with an indented code block is stored as sent', async () => {
  const sam = await signedIn({ fullName: "Sam Lee" });
  const alex = await createMember({ fullName: "Alex Kim" });
  const project = await createProject();
  const issue = await issueIn(project);
  const body = `Looks good. @${alex.username} can you review?`;

  const comment = saved(await postComment({ id: issue.displayId, requestId: randomUUID(), body }));

  expect(comment).toEqual({
    id: expect.any(String),
    body,
    author: { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
    createdAt: expect.any(String),
    editedAt: null,
    version: 0,
    mentions: [{ username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false }],
  });
  const rows = await db.select().from(mentions).where(eq(mentions.commentId, comment.id));
  expect(rows.map((row) => row.memberId)).toEqual([alex.id]);

  const indented = "    npm test\n\nThat fails for me.";
  expect(
    saved(await postComment({ id: issue.displayId, requestId: randomUUID(), body: indented })).body,
  ).toBe(indented);
});

it("REQ-031, REQ-031.3, STD-5: an empty, all-spaces, missing or 10,001-character comment and a requestId that isn't a UUID get field errors; 10,000 characters is fine", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  const cases: [Record<string, unknown>, Record<string, string>][] = [
    [{ requestId: randomUUID(), body: "" }, { body: "Comment required" }],
    [{ requestId: randomUUID(), body: "   \n  " }, { body: "Comment required" }],
    [{ requestId: randomUUID() }, { body: "Required" }],
    [{ requestId: randomUUID(), body: "a".repeat(10_001) }, { body: "Too long (max 10,000)" }],
    [{ requestId: "not-a-uuid", body: "Hi" }, { requestId: "Invalid request" }],
  ];
  for (const [input, fields] of cases) {
    expect(await postComment({ id: issue.displayId, ...input })).toEqual(fieldError(fields));
  }
  expect(await storedComments(issue.id)).toEqual([]);

  expect(
    await postComment({ id: issue.displayId, requestId: randomUUID(), body: "a".repeat(10_000) }),
  ).toMatchObject({ ok: true });
});

it("STD-5: posting again with the same requestId returns the original comment", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const requestId = randomUUID();

  const first = await postComment({ id: issue.displayId, requestId, body: "Once" });
  const again = await postComment({ id: issue.displayId, requestId, body: "Once" });

  expect(again).toEqual(first);
  expect(await storedComments(issue.id)).toHaveLength(1);
});

it("REQ-032.3: posting on an archived project's issue gets This project is archived", async () => {
  await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const issue = await issueIn(project);

  expect(await postComment({ id: issue.displayId, requestId: randomUUID(), body: "After" })).toEqual(
    refusal("forbidden", "This project is archived"),
  );
  expect(await storedComments(issue.id)).toEqual([]);
});

it("posting on a deleted issue gets This issue was deleted", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.delete(issues).where(eq(issues.id, issue.id));

  expect(await postComment({ id: issue.displayId, requestId: randomUUID(), body: "Hello?" })).toEqual(
    refusal("notFound", "This issue was deleted"),
  );
});