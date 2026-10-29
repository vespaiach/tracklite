import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../server/shared/db";
import { issues } from "../../../server/issues";
import { createSession, memberSummary } from "../../../server/identity";
import { createIssue, createLabel, createMember, createProject } from "../../../test/factories";
import { jsonRequest } from "../../../test/reset-links";
import { PATCH as patchProject } from "../projects/[key]/route";
import { GET } from "./route";

type IssueChange = PgUpdateSetSource<typeof issues> & { assigneeIds?: string[] };
type MyIssueRow = {
  id: string;
  title: string;
  projectName: string;
  priority: string;
  assignees: unknown[];
  labels: unknown[];
  updatedAt: string;
};
type MyIssueGroup = { status: string; count: number; issues: MyIssueRow[] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedInMember() {
  const member = await createMember();
  return { member, cookie: `session=${await createSession(member.id)}` };
}

async function myIssuesOf(cookie: string): Promise<MyIssueGroup[]> {
  const response = await GET(
    new Request("http://localhost:3000/api/my-issues", { headers: { Cookie: cookie } }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

async function issueIn(
  project: { id: string; key: string },
  { assigneeIds = [], ...change }: IssueChange = {},
  labelIds: string[] = [],
) {
  const issue = await createIssue(project.id, labelIds, assigneeIds);
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
  const api7 = await issueIn(api, { assigneeIds: [sam.id] });
  const web42 = await issueIn(web, { assigneeIds: [sam.id], status: "in_progress" });
  const web3 = await issueIn(web, { assigneeIds: [sam.id], status: "in_progress" });
  await issueIn(web, { assigneeIds: [alex.id], status: "in_review" });
  await issueIn(web, { status: "in_review" });

  const groups = await myIssuesOf(cookie);

  expect(groups.map(({ status, count }) => ({ status, count }))).toEqual([
    { status: "backlog", count: 1 },
    { status: "in_progress", count: 2 },
  ]);
  expect(idsIn(groups, "backlog")).toEqual([api7]);
  expect(idsIn(groups, "in_progress")?.sort()).toEqual([web42, web3].sort());
});

it("REQ-041.7: WEB-42 is assigned to Sam and Alex → it's in both Sam's and Alex's My issues, once each", async () => {
  const sam = await signedInMember();
  const alex = await signedInMember();
  const web = await createProject();
  const web42 = await issueIn(web, { assigneeIds: [sam.member.id, alex.member.id] });

  expect(allIds(await myIssuesOf(sam.cookie))).toEqual([web42]);
  expect(allIds(await myIssuesOf(alex.cookie))).toEqual([web42]);
});

it("REQ-041.2: Sam's Done and Canceled issues moved there 20 days ago aren't shown, and ones moved 3 days ago are", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const twentyDaysAgo = sql`now() - interval '20 days'`;
  const threeDaysAgo = sql`now() - interval '3 days'`;
  await issueIn(web, { assigneeIds: [sam.id], status: "done", statusChangedAt: twentyDaysAgo });
  await issueIn(web, { assigneeIds: [sam.id], status: "canceled", statusChangedAt: twentyDaysAgo });
  const open = await issueIn(web, { assigneeIds: [sam.id], statusChangedAt: twentyDaysAgo });
  const done = await issueIn(web, { assigneeIds: [sam.id], status: "done", statusChangedAt: threeDaysAgo });
  const canceled = await issueIn(web, {
    assigneeIds: [sam.id],
    status: "canceled",
    statusChangedAt: threeDaysAgo,
  });

  const groups = await myIssuesOf(cookie);

  expect(groups.map(({ status, count }) => ({ status, count }))).toEqual([
    { status: "backlog", count: 1 },
    { status: "done", count: 1 },
    { status: "canceled", count: 1 },
  ]);
  expect(idsIn(groups, "backlog")).toEqual([open]);
  expect(idsIn(groups, "done")).toEqual([done]);
  expect(idsIn(groups, "canceled")).toEqual([canceled]);
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
    await issueIn(web, { assigneeIds: [sam.id], status: statuses[index % 3] });
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
  const id = await issueIn(web, { assigneeIds: [sam.id], title: "Fix login button", priority: "high" }, [
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
      assignees: [memberSummary(sam)],
      labels: [
        { id: bug.id, name: "Bug", color: "red" },
        { id: frontend.id, name: "frontend", color: "blue" },
      ],
      updatedAt: stored.updatedAt.toISOString(),
    },
  ]);
});

it("REQ-042.1: In Progress holds WEB-3 (Low) and API-9 (Urgent) → API-9 comes first", async () => {
  const { member: sam, cookie } = await signedInMember();
  const api = await createProject();
  const web = await createProject();
  const none = await issueIn(web, { assigneeIds: [sam.id], status: "in_progress", priority: "none" });
  const web3 = await issueIn(web, { assigneeIds: [sam.id], status: "in_progress", priority: "low" });
  const medium = await issueIn(web, { assigneeIds: [sam.id], status: "in_progress", priority: "medium" });
  const api9 = await issueIn(api, { assigneeIds: [sam.id], status: "in_progress", priority: "urgent" });
  const high = await issueIn(api, { assigneeIds: [sam.id], status: "in_progress", priority: "high" });

  expect(idsIn(await myIssuesOf(cookie), "in_progress")).toEqual([api9, high, medium, web3, none]);
});

it("REQ-042: rows with the same priority are sorted most recently updated first", async () => {
  const { member: sam, cookie } = await signedInMember();
  const web = await createProject();
  const older = await issueIn(web, { assigneeIds: [sam.id], updatedAt: sql`now() - interval '3 days'` });
  const newest = await issueIn(web, { assigneeIds: [sam.id], updatedAt: sql`now() - interval '1 minute'` });
  const middle = await issueIn(web, { assigneeIds: [sam.id], updatedAt: sql`now() - interval '1 day'` });

  expect(idsIn(await myIssuesOf(cookie), "backlog")).toEqual([newest, middle, older]);
});

it("REQ-041.3, REQ-013.2, REQ-013.3: admin archives API → API-7 no longer appears in Sam's My issues; unarchiving brings it back", async () => {
  const { member: sam, cookie } = await signedInMember();
  const api = await createProject();
  const web = await createProject();
  const api7 = await issueIn(api, { assigneeIds: [sam.id] });
  const web42 = await issueIn(web, { assigneeIds: [sam.id] });
  expect(allIds(await myIssuesOf(cookie)).sort()).toEqual([api7, web42].sort());

  await setArchived(api.key, true);

  expect(allIds(await myIssuesOf(cookie))).toEqual([web42]);

  await setArchived(api.key, false);

  expect(allIds(await myIssuesOf(cookie)).sort()).toEqual([api7, web42].sort());
});