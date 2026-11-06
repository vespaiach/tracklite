import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../infrastructure/db";
import { comments } from "../../../../../infrastructure/comments/tables";
import { projects } from "../../../../../infrastructure/projects/tables";
import { createSession } from "../../../../../infrastructure/identity/session";
import { createIssue, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { IssueId } from "../../../../../domain/shared/identifiers";
import { listIssueComments } from "../../../../../queries";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function cookieOf(member: { id: string }) {
  return `session=${await createSession(member.id)}`;
}

function listWith(cookie: string, key: string) {
  return GET(
    new Request(`http://localhost:3000/api/projects/${key}/comments`, { headers: { Cookie: cookie } }),
    {
      params: Promise.resolve({ key }),
    },
  );
}

function postWith(cookie: string, key: string, body: unknown) {
  return POST(jsonRequest("POST", `/api/projects/${key}/comments`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

it("REQ-032.2, REQ-046.1: Alex comments on project WEB → it's in WEB's thread, not on any issue", async () => {
  const alex = await createMember({ fullName: "Alex Kim" });
  const cookie = await cookieOf(alex);
  const project = await createProject();
  const issue = await createIssue(project.id);
  const displayId = `${project.key}-${issue.number}`;

  const post = await postWith(cookie, project.key.toLowerCase(), {
    requestId: randomUUID(),
    body: "Kickoff notes",
  });
  expect(post.status).toBe(201);
  expect((await post.json()).author.fullName).toBe("Alex Kim");

  const thread = await (await listWith(cookie, project.key)).json();
  expect(thread.map((comment: { body: string }) => comment.body)).toEqual(["Kickoff notes"]);
  expect(await listIssueComments(alex, IssueId.from(displayId))).toEqual([]);
});

it("REQ-032.3: an archived project's thread still loads, but posting gets This project is archived", async () => {
  const cookie = await cookieOf(await createMember());
  const project = await createProject();
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  expect((await listWith(cookie, project.key)).status).toBe(200);
  const post = await postWith(cookie, project.key, { requestId: randomUUID(), body: "Too late" });

  expect(post.status).toBe(403);
  expect(await post.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await db.select().from(comments).where(eq(comments.projectId, project.id))).toEqual([]);
});

it("an unknown project key gets Not found", async () => {
  const cookie = await cookieOf(await createMember());

  expect((await listWith(cookie, "NOPE")).status).toBe(404);
  expect((await postWith(cookie, "NOPE", { requestId: randomUUID(), body: "Hi" })).status).toBe(404);
});