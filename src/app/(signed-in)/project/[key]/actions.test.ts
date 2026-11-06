import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { deleteIssue } from "../../../../application/issues/delete-issue";
import { memberSummary } from "../../../../domain/identity/member-summary";
import { IssueId, ProjectKey } from "../../../../domain/shared/identifiers";
import { db } from "../../../../infrastructure/db";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { issueWork } from "../../../../infrastructure/issues/issue-work";
import { issues } from "../../../../infrastructure/issues/tables";
import { notificationBatches, notifications } from "../../../../infrastructure/notifications/tables";
import type { Member } from "../../../../infrastructure/identity/tables";
import { projects } from "../../../../infrastructure/projects/tables";
import type { issueStatus } from "../../../../infrastructure/schema";
import { findIssueById, getBoard } from "../../../../queries";
import { createIssue as createStored, createMember, createProject } from "../../../../test/factories";
import { recordEvents } from "../../../../test/outbox";
import { setNextRequest } from "../../../../test/next-request";
import { createIssue, moveIssue } from "./actions";

type IssueStatus = (typeof issueStatus.enumValues)[number];

async function signedIn(overrides: Parameters<typeof createMember>[0] = {}) {
  const member = await createMember(overrides);
  await startSessionFor(member);
  return member;
}

async function startSessionFor(member: Member) {
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
}

async function issuesOf(projectId: string) {
  return db.select().from(issues).where(eq(issues.projectId, projectId));
}

function fieldError(fields: Record<string, string>) {
  return { ok: false, error: { kind: "invalid", message: "Check the highlighted fields", fields } };
}

function refusal(kind: string, message: string) {
  return { ok: false, error: { kind, message } };
}

async function created(result: Awaited<ReturnType<typeof createIssue>>) {
  if (!result.ok) throw new Error(result.error.message);
  return result.data.id;
}

async function issueIn(project: { id: string; key: string }, status: IssueStatus = "backlog") {
  const issue = await createStored(project.id);
  if (status !== "backlog") await db.update(issues).set({ status }).where(eq(issues.id, issue.id));
  return { ...issue, displayId: `${project.key}-${issue.number}` };
}

async function column(member: Member, key: string, status: IssueStatus) {
  const board = await getBoard(member, ProjectKey.from(key));
  return board.find((entry) => entry.status === status)?.cards.map((card) => card.id);
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

it("REQ-016.1: the first issue in WEB is WEB-1, Backlog, No priority, unassigned, created by Sam, and the page is refreshed", async () => {
  const sam = await signedIn({ fullName: "Sam Lee" });
  const project = await createProject();

  const id = await created(
    await createIssue({
      key: project.key.toLowerCase(),
      requestId: randomUUID(),
      title: "  Fix login button  ",
    }),
  );

  expect(id).toBe(`${project.key}-1`);
  expect(refresh).toHaveBeenCalledOnce();
  expect(await findIssueById(sam, IssueId.from(id))).toEqual({
    id,
    title: "Fix login button",
    description: "",
    status: "backlog",
    priority: "none",
    assignees: [],
    createdBy: memberSummary(sam),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
    labels: [],
    descriptionVersion: 0,
    mentions: [],
    archived: false,
  });
  expect(memberSummary(sam).fullName).toBe("Sam Lee");
});

it("REQ-016.6, REQ-019.5: Sam creates an issue with Alex and Jo as assignees → assigned to both, sorted by name, and each is notified; a deactivated assignee creates nothing", async () => {
  const sam = await signedIn({ fullName: "Sam Lee" });
  const alex = await createMember({ fullName: "Alex Kim" });
  const jo = await createMember({ fullName: "Jo Park" });
  const pat = await createMember({ deactivatedAt: new Date() });
  const project = await createProject();

  const id = await created(
    await createIssue({
      key: project.key,
      requestId: randomUUID(),
      title: "Fix login button",
      assignees: [jo.username, alex.username, sam.username],
    }),
  );

  expect((await findIssueById(sam, IssueId.from(id)))?.assignees).toEqual([
    memberSummary(alex),
    memberSummary(jo),
    memberSummary(sam),
  ]);
  await recordEvents();
  const notified = await db
    .select({ recipientId: notificationBatches.recipientId })
    .from(notifications)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notifications.batchId))
    .where(and(eq(notifications.kind, "assigned"), eq(notifications.actorId, sam.id)));
  expect(notified.map((row) => row.recipientId).sort()).toEqual([alex.id, jo.id].sort());

  expect(
    await createIssue({
      key: project.key,
      requestId: randomUUID(),
      title: "Fix logout button",
      assignees: [alex.username, pat.username],
    }),
  ).toEqual(fieldError({ assignees: "Choose an active member" }));
  expect(await issuesOf(project.id)).toHaveLength(1);
});

it("REQ-016.2: after WEB-41 with WEB-40 deleted, the next issue is WEB-42", async () => {
  await signedIn();
  const project = await createProject({ nextIssueNumber: 40 });
  await createIssue({ key: project.key, requestId: randomUUID(), title: "Forty" });
  await createIssue({ key: project.key, requestId: randomUUID(), title: "Forty-one" });
  await db.delete(issues).where(and(eq(issues.projectId, project.id), eq(issues.number, 40)));

  expect(await createIssue({ key: project.key, requestId: randomUUID(), title: "Next" })).toEqual({
    ok: true,
    data: { id: `${project.key}-42` },
  });
});

it("REQ-016.3, REQ-016, STD-5: a blank or 201-character title and a requestId that isn't a UUID get field errors and create nothing", async () => {
  await signedIn();
  const project = await createProject();

  expect(await createIssue({ key: project.key, requestId: randomUUID(), title: "   " })).toEqual(
    fieldError({ title: "Title required" }),
  );
  expect(await createIssue({ key: project.key, requestId: randomUUID(), title: "x".repeat(201) })).toEqual(
    fieldError({ title: "Too long (max 200)" }),
  );
  expect(await createIssue({ key: project.key, requestId: "not-a-uuid", title: "Fix login button" })).toEqual(
    fieldError({ requestId: "Invalid request" }),
  );
  expect(await issuesOf(project.id)).toHaveLength(0);
});

it("REQ-016.4: concurrent creates get distinct numbers", async () => {
  const project = await createProject({ nextIssueNumber: 42 });
  await signedIn();

  const results = await Promise.all([
    createIssue({ key: project.key, requestId: randomUUID(), title: "From Sam" }),
    createIssue({ key: project.key, requestId: randomUUID(), title: "From Alex" }),
  ]);

  const ids = await Promise.all(results.map(created));
  expect(ids.sort()).toEqual([`${project.key}-42`, `${project.key}-43`]);
});

it("STD-5: a repeated requestId returns the original issue and creates nothing", async () => {
  await signedIn();
  const project = await createProject();
  const requestId = randomUUID();

  const first = await createIssue({ key: project.key, requestId, title: "Fix login button" });
  const repeat = await createIssue({ key: project.key, requestId, title: "Fix login button" });

  expect(repeat).toEqual(first);
  expect(await issuesOf(project.id)).toHaveLength(1);
  const [counter] = await db.select().from(projects).where(eq(projects.id, project.id));
  expect(counter.nextIssueNumber).toBe(2);
});

it("REQ-013.4, STD-4: creating an issue in an archived project is refused, and in an unknown project is Not found", async () => {
  await signedIn();
  const project = await createProject({ archivedAt: new Date() });

  expect(await createIssue({ key: project.key, requestId: randomUUID(), title: "Fix login button" })).toEqual(
    refusal("forbidden", "This project is archived"),
  );
  expect(await createIssue({ key: "Q1", requestId: randomUUID(), title: "Fix login button" })).toEqual(
    refusal("notFound", "Not found"),
  );
  expect(await issuesOf(project.id)).toHaveLength(0);
});

it("REQ-027.3, REQ-029.1: Sam clicks + on Backlog and creates WEB-43 → it's at the top of Backlog; + on In Review starts it in In Review", async () => {
  const sam = await signedIn();
  const project = await createProject({ nextIssueNumber: 43_000 });
  const existing = await createStored(project.id);

  const id = await created(
    await createIssue({ key: project.key, requestId: randomUUID(), title: "New card", status: "backlog" }),
  );
  const inReview = await created(
    await createIssue({
      key: project.key,
      requestId: randomUUID(),
      title: "Update pricing copy",
      status: "in_review",
    }),
  );

  const backlog = await db
    .select({ number: issues.number })
    .from(issues)
    .where(and(eq(issues.projectId, project.id), eq(issues.status, "backlog")))
    .orderBy(asc(issues.position), asc(issues.id));
  expect(backlog.map((row) => `${project.key}-${row.number}`)).toEqual([
    id,
    `${project.key}-${existing.number}`,
  ]);
  expect(await column(sam, project.key, "in_review")).toEqual([inReview]);
});

it("REQ-026.1, REQ-030.1: Sam drags WEB-42 from Backlog to In Progress → at the top of In Progress, still there after a reload, and the page is refreshed", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const existing = await issueIn(project, "in_progress");
  const issue = await issueIn(project);

  expect(await moveIssue({ id: issue.displayId, status: "in_progress", place: "top" })).toEqual({
    ok: true,
    data: null,
  });

  expect(refresh).toHaveBeenCalledOnce();
  expect(await column(sam, project.key, "in_progress")).toEqual([issue.displayId, existing.displayId]);
  expect(await column(sam, project.key, "backlog")).toEqual([]);
});

it("REQ-026.3, REQ-030.2: Sam moves WEB-5 to the bottom and Alex moves WEB-9 to the top of In Progress at the same time → both moves are kept", async () => {
  await signedIn();
  const alex = await createMember();
  const project = await createProject();
  const web5 = await issueIn(project, "in_progress");
  const middle = await issueIn(project, "in_progress");
  const web9 = await issueIn(project, "in_progress");

  await Promise.all([
    moveIssue({ id: web5.displayId, status: "in_progress", place: "bottom" }),
    moveIssue({ id: web9.displayId, status: "in_progress", place: "top" }),
  ]);

  expect(await column(alex, project.key, "in_progress")).toEqual([
    web9.displayId,
    middle.displayId,
    web5.displayId,
  ]);
});

it("REQ-026.4: a drag from an older board still lands: Done → In Review works, and an 'after' card that left the column or is the moved card itself means the top", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const done = await issueIn(project, "done");
  const first = await issueIn(project, "in_progress");
  const issue = await issueIn(project);

  expect(await moveIssue({ id: done.displayId, status: "in_review", place: "top" })).toMatchObject({
    ok: true,
  });
  expect(await column(sam, project.key, "in_review")).toEqual([done.displayId]);
  expect(await column(sam, project.key, "done")).toEqual([]);

  expect(
    await moveIssue({ id: issue.displayId, status: "in_progress", place: { after: done.displayId } }),
  ).toMatchObject({ ok: true });
  expect(await column(sam, project.key, "in_progress")).toEqual([issue.displayId, first.displayId]);

  await moveIssue({ id: issue.displayId, status: "in_progress", place: "bottom" });
  expect(
    await moveIssue({ id: issue.displayId, status: "in_progress", place: { after: issue.displayId } }),
  ).toMatchObject({ ok: true });
  expect(await column(sam, project.key, "in_progress")).toEqual([issue.displayId, first.displayId]);
});

it("REQ-026.5: Sam drags WEB-42 after another member deleted it → This issue was deleted", async () => {
  const admin = await createMember({ role: "admin" });
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await deleteIssue(admin, issueWork, IssueId.from(issue.displayId));

  expect(await moveIssue({ id: issue.displayId, status: "in_progress", place: "top" })).toEqual(
    refusal("notFound", "This issue was deleted"),
  );
});

it("REQ-027.1, REQ-027.2: 'after' places a card within its column, and from Backlog between two In Progress cards; Alex sees the same order after a reload", async () => {
  await signedIn();
  const alex = await createMember();
  const project = await createProject();
  const before = await issueIn(project, "in_progress");
  const web5 = await issueIn(project, "in_progress");
  const web9 = await issueIn(project, "in_progress");
  const issue = await issueIn(project);

  await moveIssue({ id: web9.displayId, status: "in_progress", place: { after: before.displayId } });

  expect(await column(alex, project.key, "in_progress")).toEqual([
    before.displayId,
    web9.displayId,
    web5.displayId,
  ]);

  await moveIssue({
    id: issue.displayId,
    status: "in_progress",
    place: { after: web9.displayId.toLowerCase() },
  });

  expect(await column(alex, project.key, "in_progress")).toEqual([
    before.displayId,
    web9.displayId,
    issue.displayId,
    web5.displayId,
  ]);
});

it("REQ-036.5: reordering a card within its column changes neither updatedAt nor statusChangedAt; a status change by dragging sets both", async () => {
  await signedIn();
  const project = await createProject();
  await issueIn(project);
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  await moveIssue({ id: issue.displayId, status: "backlog", place: "top" });

  const reordered = await stored(issue.id);
  expect(reordered.position).not.toBe(before.position);
  expect(reordered.updatedAt).toEqual(before.updatedAt);
  expect(reordered.statusChangedAt).toEqual(before.statusChangedAt);

  await moveIssue({ id: issue.displayId, status: "done", place: "top" });

  const moved = await stored(issue.id);
  expect(moved.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  expect(moved.statusChangedAt.getTime()).toBeGreaterThan(before.statusChangedAt.getTime());
});

it("REQ-024.2: moving a card in an archived project → This project is archived", async () => {
  await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const issue = await issueIn(project);

  expect(await moveIssue({ id: issue.displayId, status: "in_progress", place: "top" })).toEqual(
    refusal("forbidden", "This project is archived"),
  );
  expect((await stored(issue.id)).status).toBe("backlog");
});

it("REQ-026: an unknown status or a malformed place is rejected with field errors", async () => {
  await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  expect(await moveIssue({ id: issue.displayId, status: "shipped", place: "top" })).toEqual(
    fieldError({ status: "Choose a status" }),
  );
  expect(await moveIssue({ id: issue.displayId, status: "backlog", place: "middle" })).toEqual(
    fieldError({ place: "Choose a place" }),
  );
  expect(await moveIssue({ id: issue.displayId, status: "backlog", place: { after: 5 } })).toEqual(
    fieldError({ place: "Choose a place" }),
  );
});