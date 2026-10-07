import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../../server/db";
import { comments, projects } from "../../../../../server/schema";
import { createSession } from "../../../../../server/sessions";
import { createIssue, createMember, createProject } from "../../../../../test/factories";
import { jsonRequest } from "../../../../../test/reset-links";
import { GET as listIssueComments } from "../../../issues/[id]/comments/route";
import { GET, POST } from "./route";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
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
  const cookie = await cookieOf(await createMember({ fullName: "Alex Kim" }));
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
  const issueThread = await listIssueComments(
    new Request(`http://localhost:3000/api/issues/${displayId}/comments`, { headers: { Cookie: cookie } }),
    { params: Promise.resolve({ id: displayId }) },
  );
  expect(await issueThread.json()).toEqual([]);
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