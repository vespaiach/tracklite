import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/db";
import { memberSummary } from "../../../../../server/members";
import { issues, projects } from "../../../../../server/schema";
import { createSession } from "../../../../../server/sessions";
import { createIssue, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { POST } from "./route";

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

it("REQ-016.3: a title of only spaces gets the field error Title required", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();

  const response = await createWith(cookie, project.key, { requestId: randomUUID(), title: "   " });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ title: "Title required" }));
  expect(await issuesOf(project.id)).toHaveLength(0);
});

it("REQ-016: a 201-character title gets Too long (max 200)", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();

  const response = await createWith(cookie, project.key, { requestId: randomUUID(), title: "x".repeat(201) });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ title: "Too long (max 200)" }));
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

it("STD-5: a requestId that isn't a UUID gets a field error", async () => {
  const { cookie } = await signedIn();
  const project = await createProject();

  const response = await createWith(cookie, project.key, {
    requestId: "not-a-uuid",
    title: "Fix login button",
  });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual(fieldError({ requestId: "Invalid request" }));
  expect(await issuesOf(project.id)).toHaveLength(0);
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