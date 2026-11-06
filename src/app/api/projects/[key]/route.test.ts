import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../../infrastructure/identity/session";
import { createMember, createProject } from "../../../../test/factories";
import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(role: "admin" | "member") {
  const member = await createMember({ role });
  return { member, cookie: `session=${await createSession(member.id)}` };
}

function getWith(cookie: string, key: string) {
  return GET(new Request(`http://localhost:3000/api/projects/${key}`, { headers: { Cookie: cookie } }), {
    params: Promise.resolve({ key }),
  });
}

it("REQ-016: a project is found by its key ignoring capitals", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ name: "Website", description: "Hello" });

  const response = await getWith(cookie, project.key.toLowerCase());

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    key: project.key,
    name: "Website",
    description: "Hello",
    descriptionVersion: 0,
    mentions: [],
    archivedAt: null,
    issueCounts: { backlog: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
    createdAt: project.createdAt.toISOString(),
    createdBy: null,
  });
});