import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../../server/sessions";
import { createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { POST } from "../../projects/[key]/issues/route";
import { GET } from "./route";

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

function getWith(cookie: string, id: string) {
  return GET(new Request(`http://localhost:3000/api/issues/${id}`, { headers: { Cookie: cookie } }), {
    params: Promise.resolve({ id }),
  });
}

it("REQ-016.5: GET /api/issues/web-42 returns WEB-42", async () => {
  const cookie = await signedIn();
  const project = await createProject({ nextIssueNumber: 42 });
  const created = await POST(
    jsonRequest(
      "POST",
      `/api/projects/${project.key}/issues`,
      { requestId: randomUUID(), title: "Fix login button" },
      { Cookie: cookie },
    ),
    { params: Promise.resolve({ key: project.key }) },
  );

  const response = await getWith(cookie, `${project.key.toLowerCase()}-42`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(await created.json());
});

it("REQ-016.5: an issue ID that doesn't exist gets Not found", async () => {
  const cookie = await signedIn();
  const project = await createProject();

  for (const id of [`${project.key}-999`, "nonsense", `${project.key}-0x1`]) {
    const response = await getWith(cookie, id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "Not found" } });
  }
});