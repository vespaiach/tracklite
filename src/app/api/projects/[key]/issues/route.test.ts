import { randomUUID } from "node:crypto";
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/shared/db";
import { memberSummary } from "../../../../../server/members";
import { comments, issues, labels, projects } from "../../../../../server/shared/schema";
import { createSession } from "../../../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { PUT as moveIssue } from "../../../issues/[id]/position/route";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(fullName = "Sam Lee") {
  const member = await createMember({ fullName });
  return { member, cookie: `session=${await createSession(member.id)}` };
}

function createWith(cookie: string, key: string, body: unknown) {
  return POST(jsonRequest("POST", `/api/projects/${key}/issues`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

async function issuesOf(projectId: string) {
  return db.select().from(issues).where(eq(issues.projectId, projectId));
}

function fieldError(fields: Record<string, string>) {
  return { error: { message: "Check the highlighted fields", fields } };
}

it("REQ-016.1: the first issue in WEB is WEB-1, Backlog, No priority, unassigned, created by Sam", async () => {
  const sam = await signedIn("Sam Lee");
  const project = await createProject();

  const response = await createWith(sam.cookie, project.key.toLowerCase(), {
    requestId: randomUUID(),
    title: "  Fix login button  ",
  });

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    id: `${project.key}-1`,
    title: "Fix login button",
    description: "",
    status: "backlog",
    priority: "none",
    assignee: null,
    createdBy: memberSummary(sam.member),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
    labels: [],
    descriptionVersion: 0,
    mentions: [],
    archived: false,
  });
  expect(memberSummary(sam.member).fullName).toBe("Sam Lee");
});

it("REQ-016.2: after WEB-41 with WEB-40 deleted, the next issue is WEB-42", async () => {
  const { cookie } = await signedIn();
  const project = await createProject({ nextIssueNumber: 40 });
  await createWith(cookie, project.key, { requestId: randomUUID(), title: "Forty" });
  await createWith(cookie, project.key, { requestId: randomUUID(), title: "Forty-one" });
  await db.delete(issues).where(and(eq(issues.projectId, project.id), eq(issues.number, 40)));

  const response = await createWith(cookie, project.key, { requestId: randomUUID(), title: "Next" });

  expect(response.status).toBe(201);
  expect((await response.json()).id).toBe(`${project.key}-42`);
});

it("REQ-016.3, REQ-016, STD-5: a blank or 201-character title and a requestId that isn't a UUID get field errors and create nothing", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();

  const blank = await createWith(cookie, project.key, { requestId: randomUUID(), title: "   " });
  const tooLong = await createWith(cookie, project.key, { requestId: randomUUID(), title: "x".repeat(201) });
  const badRequestId = await createWith(cookie, project.key, {
    requestId: "not-a-uuid",
    title: "Fix login button",
  });

  expect(blank.status).toBe(422);
  expect(await blank.json()).toEqual(fieldError({ title: "Title required" }));
  expect(tooLong.status).toBe(422);
  expect(await tooLong.json()).toEqual(fieldError({ title: "Too long (max 200)" }));
  expect(badRequestId.status).toBe(422);
  expect(await badRequestId.json()).toEqual(fieldError({ requestId: "Invalid request" }));
  expect(await issuesOf(project.id)).toHaveLength(0);
});

it("REQ-016.4: concurrent creates get distinct numbers", async () => {
  const sam = await signedIn("Sam Lee");
  const alex = await signedIn("Alex Kim");
  const project = await createProject({ nextIssueNumber: 42 });

  const responses = await Promise.all([
    createWith(sam.cookie, project.key, { requestId: randomUUID(), title: "From Sam" }),
    createWith(alex.cookie, project.key, { requestId: randomUUID(), title: "From Alex" }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([201, 201]);
  const ids = await Promise.all(responses.map(async (response) => (await response.json()).id));
  expect(ids.sort()).toEqual([`${project.key}-42`, `${project.key}-43`]);
});

it("STD-5: a repeated requestId returns the original issue with 200 and creates nothing", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const requestId = randomUUID();

  const first = await createWith(cookie, project.key, { requestId, title: "Fix login button" });
  const repeat = await createWith(cookie, project.key, { requestId, title: "Fix login button" });

  expect(first.status).toBe(201);
  expect(repeat.status).toBe(200);
  expect(await repeat.json()).toEqual(await first.json());
  expect(await issuesOf(project.id)).toHaveLength(1);
  const [stored] = await db.select().from(projects).where(eq(projects.id, project.id));
  expect(stored.nextIssueNumber).toBe(2);
});

it("REQ-013.4: creating an issue in an archived project is refused", async () => {
  const { cookie } = await signedIn();
  const project = await createProject({ archivedAt: new Date() });

  const response = await createWith(cookie, project.key, {
    requestId: randomUUID(),
    title: "Fix login button",
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await issuesOf(project.id)).toHaveLength(0);
});

it("REQ-027.3: Sam clicks + on Backlog and creates WEB-43 → it's at the top of Backlog", async () => {
  const sam = await signedIn();
  const project = await createProject({ nextIssueNumber: 43_000 });
  const existing = await createIssue(project.id);

  const response = await createWith(sam.cookie, project.key, {
    requestId: randomUUID(),
    title: "New card",
    status: "backlog",
  });

  expect(response.status).toBe(201);
  const created = await response.json();
  const column = await db
    .select({ number: issues.number })
    .from(issues)
    .where(and(eq(issues.projectId, project.id), eq(issues.status, "backlog")))
    .orderBy(asc(issues.position), asc(issues.id));
  expect(column.map((row) => `${project.key}-${row.number}`)).toEqual([
    created.id,
    `${project.key}-${existing.number}`,
  ]);
});

type IssueChange = PgUpdateSetSource<typeof issues>;
type ListRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: unknown;
  labels: unknown[];
  updatedAt: string;
};
type IssueList = { issues: ListRow[]; hasMore: boolean; deactivatedAssignees: unknown[] };

function listWith(cookie: string, key: string, query = "") {
  return GET(
    new Request(`http://localhost:3000/api/projects/${key}/issues${query}`, { headers: { Cookie: cookie } }),
    { params: Promise.resolve({ key }) },
  );
}

async function listOf(cookie: string, key: string, query = ""): Promise<IssueList> {
  const response = await listWith(cookie, key, query);
  expect(response.status).toBe(200);
  return response.json();
}

async function idsOf(cookie: string, key: string, query = "") {
  return (await listOf(cookie, key, query)).issues.map((row) => row.id);
}

function minutesAgo(minutes: number): SQL {
  return sql`now() - make_interval(mins => ${minutes})`;
}

async function issueIn(
  project: { id: string; key: string },
  change: IssueChange = {},
  labelIds: string[] = [],
) {
  const issue = await createIssue(project.id, labelIds);
  if (Object.keys(change).length > 0) await db.update(issues).set(change).where(eq(issues.id, issue.id));
  return `${project.key}-${change.number ?? issue.number}`;
}

async function manyIssuesIn(
  project: { id: string; key: string },
  count: number,
  status: typeof issues.$inferInsert.status = "backlog",
) {
  const creator = await createMember();
  const [{ start }] = await db
    .update(projects)
    .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + ${count}` })
    .where(eq(projects.id, project.id))
    .returning({ start: sql<number>`${projects.nextIssueNumber} - ${count}` });
  await db.insert(issues).values(
    Array.from({ length: count }, (_, index) => ({
      projectId: project.id,
      number: start + index,
      title: `Bulk ${start + index}`,
      status,
      priority: "none" as const,
      position: `a${index}`,
      createdBy: creator.id,
      requestId: randomUUID(),
      updatedAt: minutesAgo(start + index),
    })),
  );
}

it("REQ-036.1: exactly 100 issues fit on one page; at 120, 40 of them Done → the first 100 rows, then the other 20", async () => {
  const { cookie } = await signedIn();
  const project = await createProject({ nextIssueNumber: 1000 });
  await manyIssuesIn(project, 80);
  await manyIssuesIn(project, 20, "done");

  const exactlyOnePage = await listOf(cookie, project.key);

  expect(exactlyOnePage.issues).toHaveLength(100);
  expect(exactlyOnePage.hasMore).toBe(false);

  await manyIssuesIn(project, 20, "done");

  const first = await listOf(cookie, project.key);
  const second = await listOf(cookie, project.key, "?offset=100");

  expect(first.issues).toHaveLength(100);
  expect(first.hasMore).toBe(true);
  expect(second.issues).toHaveLength(20);
  expect(second.hasMore).toBe(false);
  const all = [...first.issues, ...second.issues].map((row) => row.id);
  expect(new Set(all).size).toBe(120);
});

it("REQ-036, REQ-040: newest-updated first by default, the key matched ignoring capitals, and an unknown sort, direction or offset falls back to the defaults", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const old = await issueIn(project, { updatedAt: minutesAgo(30) });
  const newest = await issueIn(project, { updatedAt: minutesAgo(1) });
  const middle = await issueIn(project, { updatedAt: minutesAgo(10) });
  const defaultOrder = [newest, middle, old];

  expect(await idsOf(cookie, project.key)).toEqual(defaultOrder);
  expect(await idsOf(cookie, project.key.toLowerCase())).toEqual(defaultOrder);
  expect(await idsOf(cookie, project.key, "?sort=title&dir=sideways&offset=abc")).toEqual(defaultOrder);
  expect(await idsOf(cookie, project.key, "?offset=-5")).toEqual(defaultOrder);
});

it("REQ-036.2: WEB-10 was Done 20 days ago → it's in the list", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const twentyDaysAgo = sql`now() - interval '20 days'`;
  const done = await issueIn(project, { status: "done", statusChangedAt: twentyDaysAgo });
  const canceled = await issueIn(project, { status: "canceled", statusChangedAt: twentyDaysAgo });

  expect((await idsOf(cookie, project.key)).sort()).toEqual([done, canceled].sort());
});

it("REQ-036.3: WEB is archived → the list, filters, search and sort all work", async () => {
  const { cookie } = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const urgent = await issueIn(project, { priority: "urgent", title: "Fix login button" });
  await issueIn(project, { priority: "low", title: "Fix login form" });
  const other = await issueIn(project, { priority: "high", title: "Write docs" });

  expect(await idsOf(cookie, project.key, "?priority=urgent&priority=high&sort=priority")).toEqual([
    urgent,
    other,
  ]);
  expect(await idsOf(cookie, project.key, "?q=button")).toEqual([urgent]);
});

it("REQ-036.5: reordering within a column keeps the issue's place; a status change by dragging moves it to the top", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const nine = await issueIn(project, { status: "in_progress", position: "a2", updatedAt: minutesAgo(30) });
  const five = await issueIn(project, { status: "in_progress", position: "a1", updatedAt: minutesAgo(10) });
  const move = (body: unknown) =>
    moveIssue(jsonRequest("PUT", `/api/issues/${nine}/position`, body, { Cookie: cookie }), {
      params: Promise.resolve({ id: nine }),
    });

  expect((await move({ status: "in_progress", place: "top" })).status).toBe(200);
  expect(await idsOf(cookie, project.key)).toEqual([five, nine]);

  expect((await move({ status: "in_review", place: "top" })).status).toBe(200);
  expect(await idsOf(cookie, project.key)).toEqual([nine, five]);
});

it("REQ-037.1: Status = In Progress and In Review, and Assignee = Sam → only Sam's issues in either status", async () => {
  const { cookie } = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const alex = await createMember({ fullName: "Alex Kim" });
  const project = await createProject();
  const samInProgress = await issueIn(project, { status: "in_progress", assigneeId: sam.id });
  const samInReview = await issueIn(project, { status: "in_review", assigneeId: sam.id });
  await issueIn(project, { status: "backlog", assigneeId: sam.id });
  await issueIn(project, { status: "in_progress", assigneeId: alex.id });
  await issueIn(project, { status: "in_review" });

  const ids = await idsOf(
    cookie,
    project.key,
    `?status=in_progress&status=in_review&assignee=${sam.username.toUpperCase()}`,
  );

  expect(ids.sort()).toEqual([samInProgress, samInReview].sort());
});

it("REQ-037.2: Assignee = Unassigned → only issues with no assignee; with a member too → either", async () => {
  const { cookie } = await signedIn();
  const sam = await createMember();
  const alex = await createMember();
  const project = await createProject();
  const unassigned = await issueIn(project);
  const sams = await issueIn(project, { assigneeId: sam.id });
  await issueIn(project, { assigneeId: alex.id });

  expect(await idsOf(cookie, project.key, "?assignee=-")).toEqual([unassigned]);
  const either = await idsOf(cookie, project.key, `?assignee=-&assignee=${sam.username}`);
  expect(either.sort()).toEqual([unassigned, sams].sort());
});

it("REQ-037.3: Label = bug and frontend → issues with either label, each listed once, and not another project's bug", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const other = await createProject();
  const bug = await createLabel(project.id, { name: "bug" });
  const frontend = await createLabel(project.id, { name: "frontend" });
  const docs = await createLabel(project.id, { name: "docs" });
  const otherBug = await createLabel(other.id, { name: "bug" });
  const bugOnly = await issueIn(project, {}, [bug.id]);
  const frontendOnly = await issueIn(project, {}, [frontend.id]);
  const both = await issueIn(project, {}, [bug.id, frontend.id, docs.id]);
  await issueIn(project, {}, [docs.id]);
  await issueIn(project);
  await issueIn(other, {}, [otherBug.id]);

  const ids = await idsOf(cookie, project.key, "?label=BUG&label=frontend");

  expect(ids.sort()).toEqual([bugOnly, frontendOnly, both].sort());
});

it("REQ-037.4: nothing matches → no rows and nothing more to load", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  await issueIn(project, { status: "backlog" });

  const list = await listOf(cookie, project.key, "?status=done");

  expect(list.issues).toEqual([]);
  expect(list.hasMore).toBe(false);
});

it("REQ-037.5: Jo is deactivated and still assigned to WEB-7 → offered as an assignee whatever the filters, and choosing Jo shows WEB-7; no one else is offered", async () => {
  const { cookie } = await signedIn();
  const jo = await createMember({ fullName: "Jo Park", deactivatedAt: new Date() });
  const project = await createProject();
  const other = await createProject();
  const elsewhere = await createMember({ deactivatedAt: new Date() });
  const active = await createMember();
  await createMember({ deactivatedAt: new Date() });
  const sevens = await issueIn(project, { assigneeId: jo.id, status: "done" });
  await issueIn(project, { assigneeId: active.id });
  await issueIn(other, { assigneeId: elsewhere.id });
  const joOnly = [{ username: jo.username, fullName: "Jo Park", initials: "JP", deactivated: true }];

  const chosen = await listOf(cookie, project.key, `?assignee=${jo.username}`);
  const filteredAway = await listOf(cookie, project.key, "?status=canceled");

  expect(chosen.issues.map((row) => row.id)).toEqual([sevens]);
  expect(chosen.deactivatedAssignees).toEqual(joOnly);
  expect(filteredAway.issues).toEqual([]);
  expect(filteredAway.deactivatedAssignees).toEqual(joOnly);
});

it('REQ-038.1, REQ-038: "login button" → WEB-1 Fix login button, plus any issue whose description has both words; a blank search shows every issue', async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const titled = await issueIn(project, { title: "Fix login button" });
  const described = await issueIn(project, {
    title: "Sign-in polish",
    description: "The BUTTON on the Login page is grey",
  });
  const split = await issueIn(project, { title: "Login page", description: "Add a button" });
  await issueIn(project, { title: "Login page", description: "Redesign it" });
  await issueIn(project, { title: "Button colours" });

  const ids = await idsOf(cookie, project.key, "?q=login%20%20button%20");

  expect(ids.sort()).toEqual([titled, described, split].sort());
  expect(await idsOf(cookie, project.key, "?q=%20%20")).toHaveLength(5);
});

it('REQ-038.2: "42" or "web-42" → WEB-42', async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const fortyTwo = await issueIn(project, { number: 42, title: "Something" });
  const seven = await issueIn(project, { number: 7, title: "Other" });

  const byNumber = await idsOf(cookie, project.key, "?q=42");
  const byId = await idsOf(cookie, project.key, `?q=${project.key.toLowerCase()}-42`);

  expect(byNumber).toContain(fortyTwo);
  expect(byNumber).not.toContain(seven);
  expect(byId).toEqual([fortyTwo]);
});

it("REQ-038.3: a word that only appears in a comment → that issue isn't shown", async () => {
  const { member, cookie } = await signedIn();
  const project = await createProject();
  const id = await issueIn(project, { title: "Fix login" });
  const [issue] = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.projectId, project.id), eq(issues.title, "Fix login")));
  await db
    .insert(comments)
    .values({ issueId: issue.id, authorId: member.id, body: "zebra", requestId: randomUUID() });

  expect(await idsOf(cookie, project.key, "?q=zebra")).toEqual([]);
  expect(await idsOf(cookie, project.key, "?q=login")).toEqual([id]);
});

it('REQ-038.4: "100%" → only issues containing the text 100%; %, _ and \\ are plain characters', async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const percent = await issueIn(project, { title: "Coverage at 100% now" });
  const underscore = await issueIn(project, { title: "Rename user_id" });
  const backslash = await issueIn(project, { title: "Path C:\\temp" });
  await issueIn(project, { title: "Coverage at 1000 lines" });
  await issueIn(project, { title: "Load 100 issues" });
  await issueIn(project, { title: "Rename userXid" });
  await issueIn(project, { title: "Path C:temp" });

  expect(await idsOf(cookie, project.key, `?q=${encodeURIComponent("100%")}`)).toEqual([percent]);
  expect(await idsOf(cookie, project.key, `?q=${encodeURIComponent("user_id")}`)).toEqual([underscore]);
  expect(await idsOf(cookie, project.key, `?q=${encodeURIComponent("c:\\")}`)).toEqual([backslash]);
});

it("REQ-039.1: Sam clicks Priority → Urgent first and No priority last; clicking again → the reverse", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const low = await issueIn(project, { priority: "low" });
  const none = await issueIn(project, { priority: "none" });
  const urgent = await issueIn(project, { priority: "urgent" });
  const medium = await issueIn(project, { priority: "medium" });
  const high = await issueIn(project, { priority: "high" });

  expect(await idsOf(cookie, project.key, "?sort=priority")).toEqual([urgent, high, medium, low, none]);
  expect(await idsOf(cookie, project.key, "?sort=priority&dir=asc")).toEqual([
    urgent,
    high,
    medium,
    low,
    none,
  ]);
  expect(await idsOf(cookie, project.key, "?sort=priority&dir=desc")).toEqual([
    none,
    low,
    medium,
    high,
    urgent,
  ]);
});

it("REQ-039: Status sorts in the REQ-017 order, ID by number, Last updated newest first, and each reverses", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const canceled = await issueIn(project, { number: 100, status: "canceled", updatedAt: minutesAgo(40) });
  const inReview = await issueIn(project, { number: 2, status: "in_review", updatedAt: minutesAgo(10) });
  const backlog = await issueIn(project, { number: 50, status: "backlog", updatedAt: minutesAgo(1) });
  const done = await issueIn(project, { number: 10, status: "done", updatedAt: minutesAgo(30) });
  const inProgress = await issueIn(project, { number: 7, status: "in_progress", updatedAt: minutesAgo(20) });

  const byStatus = [backlog, inProgress, inReview, done, canceled];
  const byNumber = [inReview, inProgress, done, backlog, canceled];
  const byNewest = [backlog, inReview, inProgress, done, canceled];
  expect(await idsOf(cookie, project.key, "?sort=status")).toEqual(byStatus);
  expect(await idsOf(cookie, project.key, "?sort=status&dir=desc")).toEqual([...byStatus].reverse());
  expect(await idsOf(cookie, project.key, "?sort=id")).toEqual(byNumber);
  expect(await idsOf(cookie, project.key, "?sort=id&dir=desc")).toEqual([...byNumber].reverse());
  expect(await idsOf(cookie, project.key, "?sort=updated")).toEqual(byNewest);
  expect(await idsOf(cookie, project.key, "?sort=updated&dir=asc")).toEqual([...byNewest].reverse());
});

it("REQ-039.2: WEB-3 and WEB-7 are both Urgent, and WEB-7 was updated more recently → WEB-7 comes first", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const three = await issueIn(project, { number: 3, priority: "urgent", updatedAt: minutesAgo(20) });
  const seven = await issueIn(project, { number: 7, priority: "urgent", updatedAt: minutesAgo(5) });
  const low = await issueIn(project, { number: 9, priority: "low", updatedAt: minutesAgo(1) });

  expect(await idsOf(cookie, project.key, "?sort=priority")).toEqual([seven, three, low]);
  expect(await idsOf(cookie, project.key, "?sort=priority&dir=desc")).toEqual([low, seven, three]);
});

it("REQ-040.2: a deleted label and Status = Done → only the Done filter applies", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();
  const frontend = await createLabel(project.id, { name: "frontend" });
  const done = await issueIn(project, { status: "done" });
  await issueIn(project, { status: "backlog" }, [frontend.id]);
  await db.delete(labels).where(eq(labels.id, frontend.id));

  expect(await idsOf(cookie, project.key, "?label=frontend&status=done")).toEqual([done]);
});

it("REQ-040.3, REQ-040: status=Todo, unknown usernames and unknown priorities are ignored, and the rest still applies", async () => {
  const { cookie } = await signedIn();
  const sam = await createMember();
  const project = await createProject();
  const sams = await issueIn(project, { assigneeId: sam.id, priority: "high", status: "done" });
  await issueIn(project, { priority: "high" });
  await issueIn(project, { assigneeId: sam.id, priority: "low" });

  expect(await idsOf(cookie, project.key, "?status=Todo")).toHaveLength(3);
  expect(await idsOf(cookie, project.key, "?assignee=nobody-here&priority=extreme")).toHaveLength(3);
  expect(
    await idsOf(
      cookie,
      project.key,
      `?assignee=nobody-here&assignee=${sam.username}&priority=high&priority=extreme`,
    ),
  ).toEqual([sams]);
});

it("REQ-036: a row carries ID, title, status, priority, assignee, labels sorted by name, and last updated", async () => {
  const { cookie } = await signedIn();
  const alex = await createMember({ fullName: "Alex Kim" });
  const project = await createProject();
  const ux = await createLabel(project.id, { name: "ux", color: "blue" });
  const bug = await createLabel(project.id, { name: "Bug", color: "red" });
  const id = await issueIn(
    project,
    { title: "Fix login", status: "in_review", priority: "high", assigneeId: alex.id, description: "secret" },
    [ux.id, bug.id],
  );

  const [row] = (await listOf(cookie, project.key)).issues;

  expect(row).toEqual({
    id,
    title: "Fix login",
    status: "in_review",
    priority: "high",
    assignee: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
    labels: [
      { id: bug.id, name: "Bug", color: "red" },
      { id: ux.id, name: "ux", color: "blue" },
    ],
    updatedAt: expect.any(String),
  });
  expect(new Date(row.updatedAt).toISOString()).toBe(row.updatedAt);
});

it("REQ-036: an unknown project key gets Not found", async () => {
  const { cookie } = await signedIn();

  const response = await listWith(cookie, "NOPE");

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});