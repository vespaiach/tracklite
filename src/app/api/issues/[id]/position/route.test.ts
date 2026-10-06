import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/db";
import { issues, type issueStatus } from "../../../../../server/schema";
import { createSession } from "../../../../../server/sessions";
import { createIssue, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { GET } from "../../../projects/[key]/board/route";
import { DELETE } from "../route";
import { PUT } from "./route";

type IssueStatus = (typeof issueStatus.enumValues)[number];
type BoardColumn = { status: string; cards: { id: string }[] };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(role: "member" | "admin" = "member") {
  const member = await createMember({ role });
  return `session=${await createSession(member.id)}`;
}

function moveWith(cookie: string, id: string, body: unknown) {
  return PUT(jsonRequest("PUT", `/api/issues/${id}/position`, body, { Cookie: cookie }), {
    params: Promise.resolve({ id }),
  });
}

async function issueIn(project: { id: string; key: string }, status: IssueStatus = "backlog") {
  const issue = await createIssue(project.id);
  if (status !== "backlog") await db.update(issues).set({ status }).where(eq(issues.id, issue.id));
  return { ...issue, displayId: `${project.key}-${issue.number}` };
}

async function column(cookie: string, key: string, status: IssueStatus) {
  const response = await GET(
    new Request(`http://localhost:3000/api/projects/${key}/board`, { headers: { Cookie: cookie } }),
    { params: Promise.resolve({ key }) },
  );
  const board: BoardColumn[] = await response.json();
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

function fieldError(fields: Record<string, string>) {
  return { error: { message: "Check the highlighted fields", fields } };
}

it("REQ-026.1: Sam drags WEB-42 from Backlog to In Progress → In Progress, still there after a reload", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const existing = await issueIn(project, "in_progress");
  const issue = await issueIn(project);

  const response = await moveWith(sam, issue.displayId, { status: "in_progress", place: "top" });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.id).toBe(issue.displayId);
  expect(body.status).toBe("in_progress");
  expect(await column(sam, project.key, "in_progress")).toEqual([issue.displayId, existing.displayId]);
  expect(await column(sam, project.key, "backlog")).toEqual([]);
});

it("REQ-026.3: Sam moves WEB-5 and Alex moves WEB-9 within In Progress at the same time → both moves are kept", async () => {
  const sam = await signedIn();
  const alex = await signedIn();
  const project = await createProject();
  const web5 = await issueIn(project, "in_progress");
  const middle = await issueIn(project, "in_progress");
  const web9 = await issueIn(project, "in_progress");

  const responses = await Promise.all([
    moveWith(sam, web5.displayId, { status: "in_progress", place: "bottom" }),
    moveWith(alex, web9.displayId, { status: "in_progress", place: "top" }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(await column(sam, project.key, "in_progress")).toEqual([
    web9.displayId,
    middle.displayId,
    web5.displayId,
  ]);
});

it("REQ-026.4: Alex has moved WEB-42 to Done; Sam, on an older board, drags it to In Review → WEB-42 is In Review", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project, "done");

  const response = await moveWith(sam, issue.displayId, { status: "in_review", place: "top" });

  expect(response.status).toBe(200);
  expect(await column(sam, project.key, "in_review")).toEqual([issue.displayId]);
  expect(await column(sam, project.key, "done")).toEqual([]);
});

it("REQ-026.4: the card named in 'after' has left the column → the moved card goes to the top", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const first = await issueIn(project, "in_progress");
  const elsewhere = await issueIn(project, "done");
  const issue = await issueIn(project);

  const response = await moveWith(sam, issue.displayId, {
    status: "in_progress",
    place: { after: elsewhere.displayId },
  });

  expect(response.status).toBe(200);
  expect(await column(sam, project.key, "in_progress")).toEqual([issue.displayId, first.displayId]);
});

it("REQ-026.4: 'after' naming the moved card itself → the card goes to the top", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const first = await issueIn(project);
  const issue = await issueIn(project);

  const response = await moveWith(sam, issue.displayId, {
    status: "backlog",
    place: { after: issue.displayId },
  });

  expect(response.status).toBe(200);
  expect(await column(sam, project.key, "backlog")).toEqual([issue.displayId, first.displayId]);
});

it("REQ-026.5: Sam drags WEB-42 after another member deleted it → This issue was deleted", async () => {
  const admin = await signedIn("admin");
  const sam = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  await DELETE(jsonRequest("DELETE", `/api/issues/${issue.displayId}`, undefined, { Cookie: admin }), {
    params: Promise.resolve({ id: issue.displayId }),
  });

  const response = await moveWith(sam, issue.displayId, { status: "in_progress", place: "top" });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { message: "This issue was deleted" } });
});

it("REQ-027.1: Sam drags WEB-9 above WEB-5 in In Progress → after a reload, Alex also sees WEB-9 above WEB-5", async () => {
  const sam = await signedIn();
  const alex = await signedIn();
  const project = await createProject();
  const before = await issueIn(project, "in_progress");
  const web5 = await issueIn(project, "in_progress");
  const web9 = await issueIn(project, "in_progress");

  const response = await moveWith(sam, web9.displayId, {
    status: "in_progress",
    place: { after: before.displayId },
  });

  expect(response.status).toBe(200);
  expect(await column(alex, project.key, "in_progress")).toEqual([
    before.displayId,
    web9.displayId,
    web5.displayId,
  ]);
});

it("REQ-027.2: Sam drags WEB-42 from Backlog between WEB-5 and WEB-9 in In Progress → In Progress, between those two", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const web5 = await issueIn(project, "in_progress");
  const web9 = await issueIn(project, "in_progress");
  const issue = await issueIn(project);

  const response = await moveWith(sam, issue.displayId, {
    status: "in_progress",
    place: { after: web5.displayId.toLowerCase() },
  });

  expect(response.status).toBe(200);
  expect((await response.json()).status).toBe("in_progress");
  expect(await column(sam, project.key, "in_progress")).toEqual([
    web5.displayId,
    issue.displayId,
    web9.displayId,
  ]);
});

it("REQ-030.1: Move to → In Review puts WEB-42 at the top of In Review", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const existing = await issueIn(project, "in_review");
  const issue = await issueIn(project);

  const response = await moveWith(sam, issue.displayId, { status: "in_review", place: "top" });

  expect(response.status).toBe(200);
  expect(await column(sam, project.key, "in_review")).toEqual([issue.displayId, existing.displayId]);
});

it("REQ-030.2: Move to bottom puts WEB-5 last in In Progress", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const web5 = await issueIn(project, "in_progress");
  const second = await issueIn(project, "in_progress");
  const third = await issueIn(project, "in_progress");

  const response = await moveWith(sam, web5.displayId, { status: "in_progress", place: "bottom" });

  expect(response.status).toBe(200);
  expect(await column(sam, project.key, "in_progress")).toEqual([
    second.displayId,
    third.displayId,
    web5.displayId,
  ]);
});

it("REQ-036.5: reordering a card within its column changes neither updatedAt nor statusChangedAt", async () => {
  const sam = await signedIn();
  const project = await createProject();
  await issueIn(project);
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  const response = await moveWith(sam, issue.displayId, { status: "backlog", place: "top" });

  expect(response.status).toBe(200);
  const after = await stored(issue.id);
  expect(after.position).not.toBe(before.position);
  expect(after.updatedAt).toEqual(before.updatedAt);
  expect(after.statusChangedAt).toEqual(before.statusChangedAt);
});

it("REQ-036.5: a status change made by dragging sets updatedAt and statusChangedAt", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);
  const before = await ageTimestamps(issue.id);

  const response = await moveWith(sam, issue.displayId, { status: "done", place: "top" });

  expect(response.status).toBe(200);
  const after = await stored(issue.id);
  expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  expect(after.statusChangedAt.getTime()).toBeGreaterThan(before.statusChangedAt.getTime());
});

it("REQ-024.2: moving a card in an archived project → This project is archived", async () => {
  const sam = await signedIn();
  const project = await createProject({ archivedAt: new Date() });
  const issue = await issueIn(project);

  const response = await moveWith(sam, issue.displayId, { status: "in_progress", place: "top" });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: { message: "This project is archived" } });
  expect((await stored(issue.id)).status).toBe("backlog");
});

it("REQ-026: an unknown status or a malformed place is rejected with field errors", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const issue = await issueIn(project);

  const badStatus = await moveWith(sam, issue.displayId, { status: "shipped", place: "top" });
  const badPlace = await moveWith(sam, issue.displayId, { status: "backlog", place: "middle" });
  const badAfter = await moveWith(sam, issue.displayId, { status: "backlog", place: { after: 5 } });

  expect(badStatus.status).toBe(422);
  expect(await badStatus.json()).toEqual(fieldError({ status: "Choose a status" }));
  expect(badPlace.status).toBe(422);
  expect(await badPlace.json()).toEqual(fieldError({ place: "Choose a place" }));
  expect(badAfter.status).toBe(422);
  expect(await badAfter.json()).toEqual(fieldError({ place: "Choose a place" }));
});