import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/db";
import { issues } from "../../../../../server/schema";
import { createSession } from "../../../../../server/sessions";
import { createIssue, createLabel, createMember, createProject } from "../../../../../test/factories";
import { GET } from "./route";

type IssueChange = PgUpdateSetSource<typeof issues>;
type BoardCard = { id: string; title: string; priority: string; assignee: unknown; labels: unknown[] };
type BoardColumn = { status: string; count: number; cards: BoardCard[] };

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
  change: IssueChange = {},
  labelIds: string[] = [],
) {
  const issue = await createIssue(project.id, labelIds);
  if (Object.keys(change).length > 0) await db.update(issues).set(change).where(eq(issues.id, issue.id));
  return `${project.key}-${issue.number}`;
}

function cardIds(board: BoardColumn[], status: string) {
  return board.find((column) => column.status === status)?.cards.map((card) => card.id);
}

function cardFor(board: BoardColumn[], id: string) {
  return board.flatMap((column) => column.cards).find((card) => card.id === id);
}

it("REQ-024.1: WEB with 3 Backlog and 2 In Progress issues → Backlog (3), In Progress (2), In Review (0), Done (0), Canceled (0)", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const backlog = [await issueIn(project), await issueIn(project), await issueIn(project)];
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
  expect(cardIds(board, "backlog")).toEqual(backlog);
  expect(cardIds(board, "in_progress")).toEqual(inProgress);
  expect(cardIds(board, "in_review")).toEqual([]);
});

it("REQ-024.1: cards in a column are sorted by position", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const last = await issueIn(project, { position: "a2" });
  const first = await issueIn(project, { position: "a0" });
  const middle = await issueIn(project, { position: "a1" });

  const board = await boardOf(cookie, project.key);

  expect(cardIds(board, "backlog")).toEqual([first, middle, last]);
});

it("REQ-024.2: an archived project's board still loads with its cards", async () => {
  const cookie = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const id = await issueIn(project);

  const board = await boardOf(cookie, project.key);

  expect(cardIds(board, "backlog")).toEqual([id]);
});

it("REQ-024: the project key is matched ignoring capitals", async () => {
  const cookie = await signedIn();
  const project = await createProject();
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

it("REQ-024: a signed-out visitor gets 401", async () => {
  const project = await createProject();

  const response = await boardWith("", project.key);

  expect(response.status).toBe(401);
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

it("REQ-025.2: WEB-42 is unassigned with No priority → no assignee and priority none", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const id = await issueIn(project);

  const card = cardFor(await boardOf(cookie, project.key), id);

  expect(card).toEqual({ id, title: expect.any(String), priority: "none", assignee: null, labels: [] });
});

it("REQ-025.2: an assigned issue with a priority carries the assignee's initials and the priority", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const assignee = await createMember({ fullName: "Alex Kim" });
  const id = await issueIn(project, { assigneeId: assignee.id, priority: "high", title: "Fix login" });

  const card = cardFor(await boardOf(cookie, project.key), id);

  expect(card).toEqual({
    id,
    title: "Fix login",
    priority: "high",
    assignee: { username: assignee.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
    labels: [],
  });
});

it("REQ-028.1: WEB-10 was moved to Done 20 days ago → not on the board", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const twentyDaysAgo = sql`now() - interval '20 days'`;
  await issueIn(project, { status: "done", statusChangedAt: twentyDaysAgo });
  await issueIn(project, { status: "canceled", statusChangedAt: twentyDaysAgo });

  const board = await boardOf(cookie, project.key);

  expect(cardIds(board, "done")).toEqual([]);
  expect(cardIds(board, "canceled")).toEqual([]);
  expect(board.find((column) => column.status === "done")?.count).toBe(0);
});

it("REQ-028.2: WEB-11 was moved to Done 3 days ago → shown in Done", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const threeDaysAgo = sql`now() - interval '3 days'`;
  const done = await issueIn(project, { status: "done", statusChangedAt: threeDaysAgo });
  const canceled = await issueIn(project, { status: "canceled", statusChangedAt: threeDaysAgo });

  const board = await boardOf(cookie, project.key);

  expect(cardIds(board, "done")).toEqual([done]);
  expect(cardIds(board, "canceled")).toEqual([canceled]);
  expect(board.find((column) => column.status === "done")?.count).toBe(1);
});

it("REQ-028: an old status change doesn't hide issues outside Done and Canceled", async () => {
  const cookie = await signedIn();
  const project = await createProject();
  const id = await issueIn(project, { statusChangedAt: sql`now() - interval '20 days'` });

  const board = await boardOf(cookie, project.key);

  expect(cardIds(board, "backlog")).toEqual([id]);
});