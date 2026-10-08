import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/db";
import { issues } from "../../../server/schema";
import { createSession } from "../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../test/factories";
import { jsonRequest } from "../../../test/reset-links";
import { PATCH as patchProject } from "../projects/[key]/route";
import { GET } from "./route";

type IssueChange = PgUpdateSetSource<typeof issues>;
type MyIssueRow = {
  id: string;
  title: string;
  projectName: string;
  priority: string;
  labels: unknown[];
  updatedAt: string;
};
type MyIssueGroup = { status: string; count: number; issues: MyIssueRow[] };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedInMember() {
  const member = await createMember();
  return { member, cookie: `session=${await createSession(member.id)}` };
}

function myIssuesWith(cookie: string) {
  return GET(new Request("http://localhost:3000/api/my-issues", { headers: { Cookie: cookie } }));
}

async function myIssuesOf(cookie: string): Promise<MyIssueGroup[]> {
  const response = await myIssuesWith(cookie);
  expect(response.status).toBe(200);
  return response.json();
}

async function issueIn(
  project: { id: string; key: string },
  change: IssueChange = {},
  labelIds: string[] = [],
) {
  const issue = await createIssue(project.id, labelIds);
  await db
    .update(issues)
    .set({ updatedAt: sql`now() - interval '1 hour'`, ...change })
    .where(eq(issues.id, issue.id));
  return `${project.key}-${issue.number}`;
}

function idsIn(groups: MyIssueGroup[], status: string) {
  return groups.find((group) => group.status === status)?.issues.map((row) => row.id);
}

function allIds(groups: MyIssueGroup[]) {
  return groups.flatMap((group) => group.issues.map((row) => row.id));
}

async function setArchived(key: string, archived: boolean) {
  const admin = await createMember({ role: "admin" });
  const cookie = `session=${await createSession(admin.id)}`;
  const response = await patchProject(
    jsonRequest("PATCH", `/api/projects/${key}`, { archived }, { Cookie: cookie }),
    {
      params: Promise.resolve({ key }),
    },
  );
  expect(response.status).toBe(200);
}

it("REQ-041.1: Sam is assigned API-7 (Backlog), WEB-42 and WEB-3 (In Progress) → groups Backlog (1) and In Progress (2)", async () => {
  const { member: sam, cookie } = await signedInMember();
  const alex = await createMember();
  const api = await createProject();
  const web = await createProject();
  const api7 = await issueIn(api, { assigneeId: sam.id });
  const web42 = await issueIn(web, { assigneeId: sam.id, status: "in_progress" });
  const web3 = await issueIn(web, { assigneeId: sam.id, status: "in_progress" });
  await issueIn(web, { assigneeId: alex.id, status: "in_review" });
  await issueIn(web, { status: "in_review" });

  const groups = await myIssuesOf(cookie);

  expect(groups.map(({ status, count }) => ({ status, count }))).toEqual([
    { status: "backlog", count: 1 },
    { status: "in_progress", count: 2 },
  ]);
  expect(idsIn(groups, "backlog")).toEqual([api7]);
  expect(idsIn(groups, "in_progress")?.sort()).toEqual([web42, web3].sort());
});

it("REQ-041.2: Sam's WEB-10 moved to Done 20 days ago → not shown", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const twentyDaysAgo = sql`now() - interval '20 days'`;
  await issueIn(web, { assigneeId: sam.id, status: "done", statusChangedAt: twentyDaysAgo });
  await issueIn(web, { assigneeId: sam.id, status: "canceled", statusChangedAt: twentyDaysAgo });
  const open = await issueIn(web, { assigneeId: sam.id, statusChangedAt: twentyDaysAgo });

  const groups = await myIssuesOf(cookie);

  expect(groups.map((group) => group.status)).toEqual(["backlog"]);
  expect(allIds(groups)).toEqual([open]);
});

it("REQ-041.2: Done and Canceled issues moved there 3 days ago are shown", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const threeDaysAgo = sql`now() - interval '3 days'`;
  const done = await issueIn(web, { assigneeId: sam.id, status: "done", statusChangedAt: threeDaysAgo });
  const canceled = await issueIn(web, {
    assigneeId: sam.id,
    status: "canceled",
    statusChangedAt: threeDaysAgo,
  });

  const groups = await myIssuesOf(cookie);

  expect(groups.map(({ status, count }) => ({ status, count }))).toEqual([
    { status: "done", count: 1 },
    { status: "canceled", count: 1 },
  ]);
  expect(idsIn(groups, "done")).toEqual([done]);
  expect(idsIn(groups, "canceled")).toEqual([canceled]);
});

it("REQ-041.3: project API is archived → API-7 isn't shown", async () => {
  const { member: sam, cookie } = await signedInMember();
  const api = await createProject({ archivedAt: new Date() });
  const web = await createProject();
  await issueIn(api, { assigneeId: sam.id });
  const web42 = await issueIn(web, { assigneeId: sam.id });

  expect(allIds(await myIssuesOf(cookie))).toEqual([web42]);
});

it("REQ-041.4: nothing is assigned to Sam → no groups", async () => {
  const { cookie } = await signedInMember();
  const web = await createProject();
  await issueIn(web);

  expect(await myIssuesOf(cookie)).toEqual([]);
});

it("REQ-041.5: Sam is assigned 300 open issues → all 300 are returned, grouped", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const statuses = ["backlog", "in_progress", "in_review"] as const;
  for (let index = 0; index < 300; index++) {
    await issueIn(web, { assigneeId: sam.id, status: statuses[index % 3] });
  }

  const groups = await myIssuesOf(cookie);

  expect(groups.map(({ status, count, issues }) => ({ status, count, rows: issues.length }))).toEqual(
    statuses.map((status) => ({ status, count: 100, rows: 100 })),
  );
}, 30_000);

it("REQ-041: a row carries id, title, project name, priority, labels (sorted by name) and updatedAt", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject({ name: "Website" });
  const frontend = await createLabel(web.id, { name: "frontend", color: "blue" });
  const bug = await createLabel(web.id, { name: "Bug", color: "red" });
  const id = await issueIn(web, { assigneeId: sam.id, title: "Fix login button", priority: "high" }, [
    frontend.id,
    bug.id,
  ]);
  const [stored] = await db
    .select({ updatedAt: issues.updatedAt })
    .from(issues)
    .where(and(eq(issues.projectId, web.id), eq(issues.number, Number(id.split("-")[1]))));

  const [group] = await myIssuesOf(cookie);

  expect(group.issues).toEqual([
    {
      id,
      title: "Fix login button",
      projectName: "Website",
      priority: "high",
      labels: [
        { id: bug.id, name: "Bug", color: "red" },
        { id: frontend.id, name: "frontend", color: "blue" },
      ],
      updatedAt: stored.updatedAt.toISOString(),
    },
  ]);
});

it("REQ-041: a signed-out visitor gets 401", async () => {
  const response = await myIssuesWith("");

  expect(response.status).toBe(401);
});

it("REQ-042.1: In Progress holds WEB-3 (Low) and API-9 (Urgent) → API-9 comes first", async () => {
  const { member: sam, cookie } = await signedInMember();
  const api = await createProject();
  const web = await createProject();
  const none = await issueIn(web, { assigneeId: sam.id, status: "in_progress", priority: "none" });
  const web3 = await issueIn(web, { assigneeId: sam.id, status: "in_progress", priority: "low" });
  const medium = await issueIn(web, { assigneeId: sam.id, status: "in_progress", priority: "medium" });
  const api9 = await issueIn(api, { assigneeId: sam.id, status: "in_progress", priority: "urgent" });
  const high = await issueIn(api, { assigneeId: sam.id, status: "in_progress", priority: "high" });

  expect(idsIn(await myIssuesOf(cookie), "in_progress")).toEqual([api9, high, medium, web3, none]);
});

it("REQ-042: rows with the same priority are sorted most recently updated first", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const older = await issueIn(web, { assigneeId: sam.id, updatedAt: sql`now() - interval '3 days'` });
  const newest = await issueIn(web, { assigneeId: sam.id, updatedAt: sql`now() - interval '1 minute'` });
  const middle = await issueIn(web, { assigneeId: sam.id, updatedAt: sql`now() - interval '1 day'` });

  expect(idsIn(await myIssuesOf(cookie), "backlog")).toEqual([newest, middle, older]);
});

it("REQ-013.2: WEB-42 assigned to Sam, admin archives WEB → it no longer appears in Sam's My issues", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const web42 = await issueIn(web, { assigneeId: sam.id });
  expect(allIds(await myIssuesOf(cookie))).toEqual([web42]);

  await setArchived(web.key, true);

  expect(await myIssuesOf(cookie)).toEqual([]);
});

it("REQ-013.3: admin unarchives WEB → WEB-42 is back in Sam's My issues", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const web42 = await issueIn(web, { assigneeId: sam.id });
  await setArchived(web.key, true);

  await setArchived(web.key, false);

  expect(allIds(await myIssuesOf(cookie))).toEqual([web42]);
});