import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession } from "../../../infrastructure/identity/session";
import { createMember, createProject } from "../../../test/factories";
import { jsonRequest } from "../../../test/reset-links";
import { PATCH } from "./[key]/route";
import { GET } from "./route";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedIn(role: "admin" | "member") {
  const member = await createMember({ role });
  return `session=${await createSession(member.id)}`;
}

async function listWith(cookie: string, archived: boolean): Promise<{ key: string; name: string }[]> {
  const response = await GET(
    new Request(`http://localhost:3000/api/projects?archived=${archived}`, { headers: { Cookie: cookie } }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

function patchWith(cookie: string, key: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/projects/${key}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

it("REQ-015.1: projects Website, API and Mobile are listed as API, Mobile, Website", async () => {
  const memberCookie = await signedIn("member");
  const created = [
    await createProject({ name: "Website" }),
    await createProject({ name: "API" }),
    await createProject({ name: "Mobile" }),
  ];
  const keys = new Set<string>(created.map((project) => project.key));

  const listed = await listWith(memberCookie, false);

  expect(listed.filter((project) => keys.has(project.key)).map((project) => project.name)).toEqual([
    "API",
    "Mobile",
    "Website",
  ]);
});

it("REQ-013.1, REQ-013.3: archiving moves a project from the sidebar list to the Archived list; unarchiving moves it back", async () => {
  const adminCookie = await signedIn("admin");
  const memberCookie = await signedIn("member");
  const { key } = await createProject();

  expect((await patchWith(adminCookie, key, { archived: true })).status).toBe(200);

  expect((await listWith(memberCookie, false)).map((project) => project.key)).not.toContain(key);
  const archived = await listWith(memberCookie, true);
  expect(archived.find((project) => project.key === key)).toMatchObject({ archivedAt: expect.any(String) });

  expect((await patchWith(adminCookie, key, { archived: false })).status).toBe(200);

  expect((await listWith(memberCookie, false)).map((project) => project.key)).toContain(key);
  expect((await listWith(memberCookie, true)).map((project) => project.key)).not.toContain(key);
});