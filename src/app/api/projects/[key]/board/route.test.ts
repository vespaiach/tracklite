import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/shared/db";
import { issues } from "../../../../../server/issues";
import { createSession } from "../../../../../server/identity";
import { createIssue, createLabel, createMember, createProject } from "../../../../../test/factories";
import { GET } from "./route";

type IssueChange = PgUpdateSetSource<typeof issues> & { assigneeIds?: string[] };
type BoardCard = { id: string; title: string; priority: string; assignees: unknown[]; labels: unknown[] };
type BoardColumn = { status: string; count: number; cards: BoardCard[] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn() {
  const member = await createMember();
  return `session=${await createSession(member.id)}`;
}

function boardWith(cookie: string, key: string) {
  return GET(
    new Request(`http://localhost:3000/api/projects/${key}/board`, { headers: { Cookie: cookie } }),
    { params: Promise.resolve({ key }) },
  );
}

async function boardOf(cookie: string, key: string): Promise<BoardColumn[]> {
  const response = await boardWith(cookie, key);
  expect(response.status).toBe(200);
  return response.json();
}

async function issueIn(
  project: { id: string; key: string },
  { assigneeIds = [], ...change }: IssueChange = {},
  labelIds: string[] = [],
) {
  const issue = await createIssue(project.id, labelIds, assigneeIds);
  if (Object.keys(change).length > 0) await db.update(issues).set(change).where(eq(issues.id, issue.id));
  return `${project.key}-${issue.number}`;
}

function cardIds(board: BoardColumn[], status: string) {
  return board.find((column) => column.status === status)?.cards.map((card) => card.id);
}

function cardFor(board: BoardColumn[], id: string) {
  return board.flatMap((column) => column.cards).find((card) => card.id === id);
}

it("REQ-024.1: WEB with 3 Backlog and 2 In Progress issues → Backlog (3), In Progress (2), In Review (0), Done (0), Canceled (0), each column sorted by position", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const last = await issueIn(project, { position: "a2" });
  const first = await issueIn(project, { position: "a0" });
  const middle = await issueIn(project, { position: "a1" });
  const inProgress = [
    await issueIn(project, { status: "in_progress" }),
    await issueIn(project, { status: "in_progress" }),
  ];

  const board = await boardOf(cookie, project.key);

  expect(board.map(({ status, count }) => ({ status, count }))).toEqual([
    { status: "backlog", count: 3 },
    { status: "in_progress", count: 2 },
    { status: "in_review", count: 0 },
    { status: "done", count: 0 },
    { status: "canceled", count: 0 },
  ]);
  expect(cardIds(board, "backlog")).toEqual([first, middle, last]);
  expect(cardIds(board, "in_progress")).toEqual(inProgress);
  expect(cardIds(board, "in_review")).toEqual([]);
});

it("REQ-024.2, REQ-024: an archived project's board still loads with its cards, with the key matched ignoring capitals", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const id = await issueIn(project);

  const board = await boardOf(cookie, project.key.toLowerCase());

  expect(cardIds(board, "backlog")).toEqual([id]);
});

it("REQ-024: an unknown project key gets Not found", async () => {
  const cookie = await signedIn();

  const response = await boardWith(cookie, "NOPE");

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "Not found" } });
});

it("REQ-025.1: WEB-42 has 5 labels → the card carries all 5, sorted by name", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const names = ["ux", "Bug", "frontend", "api", "Docs"];
  const created: Awaited<ReturnType<typeof createLabel>>[] = [];
  for (const name of names) created.push(await createLabel(project.id, { name, color: "blue" }));
  const id = await issueIn(
    project,
    {},
    created.map((label) => label.id),
  );

  const card = cardFor(await boardOf(cookie, project.key), id);

  expect(card?.labels).toEqual(
    ["api", "Bug", "Docs", "frontend", "ux"].map((name) => ({
      id: created.find((label) => label.name === name)?.id,
      name,
      color: "blue",
    })),
  );
});

it("REQ-025.2, REQ-025.3: an unassigned issue with No priority has no assignees and priority none; an assigned one carries every assignee sorted by name, and the priority", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const jo = await createMember({ fullName: "Jo Park" });
  const alex = await createMember({ fullName: "Alex Kim" });
  const bare = await issueIn(project);
  const assigned = await issueIn(project, {
    assigneeIds: [jo.id, alex.id],
    priority: "high",
    title: "Fix login",
  });

  const board = await boardOf(cookie, project.key);

  expect(cardFor(board, bare)).toEqual({
    id: bare,
    title: expect.any(String),
    priority: "none",
    assignees: [],
    labels: [],
  });
  expect(cardFor(board, assigned)).toEqual({
    id: assigned,
    title: "Fix login",
    priority: "high",
    assignees: [
      { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
      { username: jo.username, fullName: "Jo Park", initials: "JP", deactivated: false },
    ],
    labels: [],
  });
});

it("REQ-028.1, REQ-028.2, REQ-028: Done and Canceled leave the board 14 days after the status change, are shown before that, and other statuses never leave", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const twentyDaysAgo = sql`now() - interval '20 days'`;
  const threeDaysAgo = sql`now() - interval '3 days'`;
  await issueIn(project, { status: "done", statusChangedAt: twentyDaysAgo });
  await issueIn(project, { status: "canceled", statusChangedAt: twentyDaysAgo });
  const recentDone = await issueIn(project, { status: "done", statusChangedAt: threeDaysAgo });
  const recentCanceled = await issueIn(project, { status: "canceled", statusChangedAt: threeDaysAgo });
  const oldBacklog = await issueIn(project, { statusChangedAt: twentyDaysAgo });

  const board = await boardOf(cookie, project.key);

  expect(cardIds(board, "done")).toEqual([recentDone]);
  expect(cardIds(board, "canceled")).toEqual([recentCanceled]);
  expect(board.find((column) => column.status === "done")?.count).toBe(1);
  expect(cardIds(board, "backlog")).toEqual([oldBacklog]);
});