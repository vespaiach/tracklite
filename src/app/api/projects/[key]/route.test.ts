import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../../../infrastructure/db";
import { issues } from "../../../../infrastructure/issues/tables";
import { projects } from "../../../../infrastructure/projects/tables";
import { mentions } from "../../../../infrastructure/notifications/tables";
import { createSession } from "../../../../infrastructure/identity/session";
import type { Member } from "../../../../infrastructure/identity/tables";
import { createMember, createProject } from "../../../../test/factories";
import { jsonRequest } from "../../../../test/reset-links";
import { GET, PATCH } from "./route";

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

function patchWith(cookie: string, key: string, body: unknown) {
  return PATCH(jsonRequest("PATCH", `/api/projects/${key}`, body, { Cookie: cookie }), {
    params: Promise.resolve({ key }),
  });
}

async function storedProject(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project;
}

async function createIssue(projectId: string, creator: Member, number: number) {
  const [issue] = await db
    .insert(issues)
    .values({
      projectId,
      number,
      title: `Issue ${number}`,
      status: "backlog",
      priority: "none",
      position: `a${number}`,
      createdBy: creator.id,
      requestId: randomUUID(),
    })
    .returning();
  return issue;
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

it("REQ-046.3: the details response counts the project's issues in every status and leaves out other projects' issues", async () => {
  const { member, cookie } = await signedIn("member");
  const web = await createProject();
  const api = await createProject();
  const statuses = ["backlog", "backlog", "backlog", "in_progress", "done", "done"] as const;
  for (const [index, status] of statuses.entries()) {
    const issue = await createIssue(web.id, member, index + 1);
    await db.update(issues).set({ status }).where(eq(issues.id, issue.id));
  }
  await createIssue(api.id, member, 1);

  const response = await getWith(cookie, web.key);

  expect((await response.json()).issueCounts).toEqual({
    backlog: 3,
    in_progress: 1,
    in_review: 0,
    done: 2,
    canceled: 0,
  });
});

it("REQ-046.4: the details response names when and by whom the project was created", async () => {
  const { cookie } = await signedIn("member");
  const alex = await createMember({ fullName: "Alex Kim", role: "admin" });
  const project = await createProject({ createdBy: alex.id });

  const response = await getWith(cookie, project.key);

  expect(await response.json()).toMatchObject({
    createdAt: project.createdAt.toISOString(),
    createdBy: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
  });
});

it("REQ-010.1: changing the key gets a field error and changes nothing", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website" });

  const response = await patchWith(cookie, project.key, { key: "SITE" });

  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { key: "Key can't be changed" } },
  });
  expect(await storedProject(project.id)).toMatchObject({ key: project.key, name: "Website" });
});

it("REQ-013.7, REQ-013.4: on an archived project, a description save is refused and nothing changes", async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website", description: "Old text", archivedAt: new Date() });

  const described = await saveDescription(cookie, project.key, "New text", 0);

  expect(described.status).toBe(403);
  expect(await described.json()).toEqual({ error: { message: "This project is archived" } });
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });
});

function saveDescription(cookie: string, key: string, description: string, descriptionVersion: number) {
  return patchWith(cookie, key, { description, descriptionVersion });
}

async function mentionedMemberIds(projectId: string) {
  const rows = await db
    .select({ memberId: mentions.memberId })
    .from(mentions)
    .where(eq(mentions.projectId, projectId));
  return rows.map((row) => row.memberId).sort();
}

it("REQ-012.1, REQ-012.3, REQ-012: a member's description is stored as sent, whether markdown, <script>alert(1)</script> or empty", async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject();
  const description = "# Goals\n\n- Faster pages\n- Fewer bugs";

  const response = await saveDescription(cookie, project.key, description, 0);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ description, descriptionVersion: 1 });
  expect(await (await getWith(cookie, project.key)).json()).toMatchObject({
    description,
    descriptionVersion: 1,
  });

  expect((await saveDescription(cookie, project.key, "<script>alert(1)</script>", 1)).status).toBe(200);
  expect((await storedProject(project.id)).description).toBe("<script>alert(1)</script>");

  expect((await saveDescription(cookie, project.key, "", 2)).status).toBe(200);
  expect((await storedProject(project.id)).description).toBe("");
});

it('§3.3: a project PATCH with a description save and a name or archived gets 422 "Change one thing at a time"', async () => {
  const { cookie } = await signedIn("admin");
  const project = await createProject({ name: "Website", description: "Old text" });

  for (const extra of [{ name: "Renamed" }, { archived: true }]) {
    const response = await patchWith(cookie, project.key, {
      description: "New text",
      descriptionVersion: 0,
      ...extra,
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { message: "Change one thing at a time" } });
  }
  expect(await storedProject(project.id)).toMatchObject({
    name: "Website",
    description: "Old text",
    descriptionVersion: 0,
    archivedAt: null,
  });
});

it('REQ-012.2, STD-8: a description of 20,001 characters gets "Too long (max 20,000)", one without a whole-number descriptionVersion is refused, and nothing is saved', async () => {
  const { cookie } = await signedIn("member");
  const project = await createProject({ description: "Old text" });

  const tooLong = await saveDescription(cookie, project.key, "x".repeat(20_001), 0);

  expect(tooLong.status).toBe(422);
  expect(await tooLong.json()).toEqual({
    error: { message: "Check the highlighted fields", fields: { description: "Too long (max 20,000)" } },
  });

  for (const body of [{ description: "New" }, { description: "New", descriptionVersion: "0" }]) {
    const unversioned = await patchWith(cookie, project.key, body);
    expect(unversioned.status).toBe(422);
    expect(await unversioned.json()).toMatchObject({
      error: { fields: { descriptionVersion: expect.any(String) } },
    });
  }
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });

  const longest = await saveDescription(cookie, project.key, "x".repeat(20_000), 0);
  expect(longest.status).toBe(200);
});

it("STD-8: a stale description save is refused with 409 naming who saved, and nothing is saved", async () => {
  const alex = await createMember({ fullName: "Alex Kim" });
  const alexCookie = `session=${await createSession(alex.id)}`;
  const { cookie: samCookie } = await signedIn("member");
  const project = await createProject({ description: "Start" });

  expect((await saveDescription(alexCookie, project.key, "Alex's text", 0)).status).toBe(200);
  const response = await saveDescription(samCookie, project.key, "Sam's text", 0);

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: { message: "This was changed by Alex Kim. Copy your text and reload." },
  });
  expect(await storedProject(project.id)).toMatchObject({
    description: "Alex's text",
    descriptionVersion: 1,
  });
});

it("DATA-001.3, DATA-001: saving a description mentions active members only, outside code, and the rows follow the current text", async () => {
  const { cookie } = await signedIn("member");
  const sam = await createMember({ fullName: "Sam Lee" });
  const jo = await createMember({ deactivatedAt: new Date() });
  const coder = await createMember();
  const project = await createProject();
  const description = `Can @${sam.username} help? Also @nobody-here, @${jo.username} and \`@${coder.username}\`.`;

  const response = await saveDescription(cookie, project.key, description, 0);

  expect(response.status).toBe(200);
  expect(await mentionedMemberIds(project.id)).toEqual([sam.id]);
  expect((await (await getWith(cookie, project.key)).json()).mentions).toEqual([
    { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
  ]);

  const alex = await createMember();
  expect((await saveDescription(cookie, project.key, `Hi @${alex.username}`, 1)).status).toBe(200);
  expect(await mentionedMemberIds(project.id)).toEqual([alex.id]);
});