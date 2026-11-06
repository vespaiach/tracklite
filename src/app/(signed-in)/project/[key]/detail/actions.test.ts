import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { expect, it } from "vitest";
import { IssueId, ProjectKey } from "../../../../../domain/shared/identifiers";
import { comments } from "../../../../../infrastructure/comments/tables";
import { db } from "../../../../../infrastructure/db";
import { createSession, sessionCookieName } from "../../../../../infrastructure/identity/session";
import type { Member } from "../../../../../infrastructure/identity/tables";
import { mentions } from "../../../../../infrastructure/notifications/tables";
import { projects } from "../../../../../infrastructure/projects/tables";
import { getProject, listIssueComments, listProjectComments } from "../../../../../queries";
import { outcome } from "../../../../../test/actions";
import { createIssue, createMember, createProject } from "../../../../../test/factories";
import { setNextRequest } from "../../../../../test/next-request";
import { postComment, saveDescription } from "./actions";

async function signedIn(overrides: Parameters<typeof createMember>[0] = {}) {
  const member = await createMember(overrides);
  await signInAs(member);
  return member;
}

async function signInAs(member: Member) {
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
}

async function storedProject(id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project;
}

async function mentionedMemberIds(projectId: string) {
  const rows = await db.select().from(mentions).where(eq(mentions.projectId, projectId));
  return rows.map((row) => row.memberId).sort();
}

function refusal(kind: string, message: string) {
  return { ok: false, error: { kind, message } };
}

it("REQ-012.1, REQ-012.3, REQ-012: a member's description is stored as sent, whether markdown, <script>alert(1)</script> or empty, and the page is refreshed", async () => {
  const sam = await signedIn();
  const project = await createProject();
  const description = "# Goals\n\n- Faster pages\n- Fewer bugs";

  expect(
    await saveDescription({ key: project.key.toLowerCase(), description, descriptionVersion: 0 }),
  ).toEqual({
    ok: true,
    data: null,
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(await getProject(sam, ProjectKey.from(project.key))).toMatchObject({
    description,
    descriptionVersion: 1,
  });

  for (const [text, version] of [
    ["<script>alert(1)</script>", 1],
    ["", 2],
  ] as const) {
    expect(
      outcome(await saveDescription({ key: project.key, description: text, descriptionVersion: version })),
    ).toBe("ok");
    expect((await storedProject(project.id)).description).toBe(text);
  }
});

it('REQ-012.2, STD-8: a description of 20,001 characters gets "Too long (max 20,000)", one without a whole-number version is refused, and nothing is saved', async () => {
  await signedIn();
  const project = await createProject({ description: "Old text" });

  expect(
    await saveDescription({ key: project.key, description: "x".repeat(20_001), descriptionVersion: 0 }),
  ).toEqual({
    ok: false,
    error: {
      kind: "invalid",
      message: "Check the highlighted fields",
      fields: { description: "Too long (max 20,000)" },
    },
  });
  for (const input of [
    { key: project.key, description: "New" },
    { key: project.key, description: "New", descriptionVersion: "0" },
    { key: project.key, description: "New", descriptionVersion: 0.5 },
  ]) {
    expect(await saveDescription(input)).toMatchObject({
      ok: false,
      error: { kind: "invalid", fields: { descriptionVersion: expect.any(String) } },
    });
  }
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });
  expect(refresh).not.toHaveBeenCalled();

  expect(
    outcome(
      await saveDescription({ key: project.key, description: "x".repeat(20_000), descriptionVersion: 0 }),
    ),
  ).toBe("ok");
});

it("STD-8: a stale description save is refused naming who saved, and nothing is saved", async () => {
  const alex = await createMember({ fullName: "Alex Kim" });
  const sam = await createMember({ fullName: "Sam Lee" });
  const project = await createProject({ description: "Start" });

  await signInAs(alex);
  expect(
    outcome(await saveDescription({ key: project.key, description: "Alex's text", descriptionVersion: 0 })),
  ).toBe("ok");
  await signInAs(sam);
  const stale = await saveDescription({ key: project.key, description: "Sam's text", descriptionVersion: 0 });

  expect(stale).toEqual(refusal("conflict", "This was changed by Alex Kim. Copy your text and reload."));
  expect(await storedProject(project.id)).toMatchObject({
    description: "Alex's text",
    descriptionVersion: 1,
  });
});

it("REQ-013.4, REQ-032.3: on an archived project, a description save and a comment are refused and nothing changes", async () => {
  const sam = await signedIn();
  const project = await createProject({ description: "Old text", archivedAt: new Date() });

  const described = await saveDescription({
    key: project.key,
    description: "New text",
    descriptionVersion: 0,
  });
  const posted = await postComment({ id: project.key, requestId: randomUUID(), body: "Too late" });

  for (const result of [described, posted])
    expect(result).toEqual(refusal("forbidden", "This project is archived"));
  expect(await storedProject(project.id)).toMatchObject({ description: "Old text", descriptionVersion: 0 });
  expect(await listProjectComments(sam, ProjectKey.from(project.key))).toEqual([]);
});

it("STD-4: a description save or a comment on an unknown project is Not found", async () => {
  await signedIn();

  for (const key of ["NOPE", "no such key"]) {
    expect(await saveDescription({ key, description: "Hi", descriptionVersion: 0 })).toEqual(
      refusal("notFound", "Not found"),
    );
    expect(await postComment({ id: key, requestId: randomUUID(), body: "Hi" })).toEqual(
      refusal("notFound", "Not found"),
    );
  }
});

it("DATA-001.3, DATA-001: saving a description mentions active members only, outside code, and the rows follow the current text", async () => {
  const author = await signedIn();
  const sam = await createMember({ fullName: "Sam Lee" });
  const jo = await createMember({ deactivatedAt: new Date() });
  const coder = await createMember();
  const project = await createProject();
  const description = `Can @${sam.username} help? Also @nobody-here, @${jo.username} and \`@${coder.username}\`.`;

  expect(outcome(await saveDescription({ key: project.key, description, descriptionVersion: 0 }))).toBe("ok");

  expect(await mentionedMemberIds(project.id)).toEqual([sam.id]);
  expect((await getProject(author, ProjectKey.from(project.key))).mentions).toEqual([
    { username: sam.username, fullName: "Sam Lee", initials: "SL", deactivated: false },
  ]);

  const alex = await createMember();
  expect(
    outcome(
      await saveDescription({ key: project.key, description: `Hi @${alex.username}`, descriptionVersion: 1 }),
    ),
  ).toBe("ok");
  expect(await mentionedMemberIds(project.id)).toEqual([alex.id]);
});

it("REQ-032.2, REQ-046.1: Alex comments on project WEB → it's in WEB's thread, not on any issue, and the page is refreshed", async () => {
  const alex = await signedIn({ fullName: "Alex Kim" });
  const project = await createProject();
  const issue = await createIssue(project.id);

  const posted = await postComment({
    id: project.key.toLowerCase(),
    requestId: randomUUID(),
    body: "Kickoff notes",
  });

  expect(posted).toEqual({ ok: true, data: null });
  expect(refresh).toHaveBeenCalledOnce();
  const [comment] = await listProjectComments(alex, ProjectKey.from(project.key));
  expect(comment).toMatchObject({ body: "Kickoff notes", author: { fullName: "Alex Kim" } });
  expect(await listIssueComments(alex, IssueId.from(`${project.key}-${issue.number}`))).toEqual([]);
});

it("REQ-031.3: a blank or too-long project comment gets a field error and nothing is posted", async () => {
  await signedIn();
  const project = await createProject();

  for (const [body, message] of [
    ["   ", "Comment required"],
    ["x".repeat(10_001), "Too long (max 10,000)"],
  ]) {
    expect(await postComment({ id: project.key, requestId: randomUUID(), body })).toMatchObject({
      ok: false,
      error: { kind: "invalid", fields: { body: message } },
    });
  }
  expect(await db.select().from(comments).where(eq(comments.projectId, project.id))).toEqual([]);
});