import { randomUUID } from "node:crypto";
import { asc, DrizzleQueryError, eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createIssue, createMember, createProject } from "../test/factories";
import { moveIntoPast } from "../test/time";
import { editComment, postIssueComment, postProjectComment } from "./comments";
import { db } from "./shared/db";
import { updateIssue } from "./issues";
import { updateProject } from "./projects";
import { issues, members, notificationBatches, notificationDeliveries, notifications } from "./shared/schema";
import type { Member } from "./sessions";

async function website() {
  const project = await createProject({ name: "Website" });
  const issue = await createIssue(project.id);
  await db.update(issues).set({ title: "Fix login button" }).where(eq(issues.id, issue.id));
  return { project, issue, issueRef: `${project.key}-${issue.number}` };
}

function notificationsFor(member: { id: string }) {
  return db
    .select({
      batchId: notificationBatches.id,
      targetType: notificationBatches.targetType,
      targetId: notificationBatches.targetId,
      waitSeconds: sql<number>`extract(epoch from ${notificationBatches.sendAfter} - ${notificationBatches.createdAt})::int`,
      kind: notifications.kind,
      actorId: notifications.actorId,
      commentId: notifications.commentId,
      dropped: notifications.dropped,
      issueRef: notifications.issueRef,
      issueTitle: notifications.issueTitle,
      projectName: notifications.projectName,
      projectKey: notifications.projectKey,
      linkPath: notifications.linkPath,
      excerpt: notifications.excerpt,
    })
    .from(notifications)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notifications.batchId))
    .where(eq(notificationBatches.recipientId, member.id))
    .orderBy(asc(notifications.createdAt), asc(notifications.id));
}

function deliveriesFor(member: { id: string }) {
  return db
    .select({
      batchId: notificationDeliveries.batchId,
      channel: notificationDeliveries.channel,
      state: notificationDeliveries.state,
      attempts: notificationDeliveries.attempts,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationBatches, eq(notificationBatches.id, notificationDeliveries.batchId))
    .where(eq(notificationBatches.recipientId, member.id))
    .orderBy(asc(notificationDeliveries.createdAt));
}

function assign(issueRef: string, by: Member, assignee: Member | null) {
  return updateIssue(by, issueRef, { assignee: assignee?.username ?? null });
}

async function comment(issueRef: string, by: Member, body: string) {
  const { comment } = await postIssueComment(by, issueRef, { requestId: randomUUID(), body });
  return comment;
}

it("REQ-043.1, §2.6: Alex assigns WEB-42 to Sam → Sam gets the email, in a new batch with one pending delivery per channel (email by default)", async () => {
  const alex = await createMember({ fullName: "Alex Kim" });
  const sam = await createMember({ fullName: "Sam Lee" });
  const { project, issue, issueRef } = await website();

  await assign(issueRef, alex, sam);

  expect(await notificationsFor(sam)).toEqual([
    {
      batchId: expect.any(String),
      targetType: "issue",
      targetId: issue.id,
      waitSeconds: 120,
      kind: "assigned",
      actorId: alex.id,
      commentId: null,
      dropped: false,
      issueRef,
      issueTitle: "Fix login button",
      projectName: "Website",
      projectKey: project.key,
      linkPath: `/issue/${issueRef}`,
      excerpt: "",
    },
  ]);
  const [{ batchId }] = await notificationsFor(sam);
  expect(sam.notificationChannels).toEqual(["email"]);
  expect(await deliveriesFor(sam)).toEqual([{ batchId, channel: "email", state: "pending", attempts: 0 }]);
});

it("REQ-043.2, REQ-044.2: Sam assigning WEB-42 to themselves or writing @sam in their own comment → no email", async () => {
  const sam = await createMember();
  const { issueRef } = await website();

  await assign(issueRef, sam, sam);
  await comment(issueRef, sam, `Note to self @${sam.username}`);

  expect(await notificationsFor(sam)).toEqual([]);
});

it("REQ-043.3, REQ-043: Alex reassigns WEB-42 from Sam to Jo → Jo gets the email; Sam gets nothing; then unassigning emails nobody", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issue, issueRef } = await website();
  await db.update(issues).set({ assigneeId: sam.id }).where(eq(issues.id, issue.id));

  await assign(issueRef, alex, jo);

  expect(await notificationsFor(sam)).toEqual([]);
  expect(await notificationsFor(jo)).toMatchObject([{ kind: "assigned", actorId: alex.id }]);

  await assign(issueRef, alex, null);

  expect(await notificationsFor(jo)).toHaveLength(1);
  expect(await notificationsFor(alex)).toEqual([]);
});

it('REQ-044.1: Alex comments "@sam can you check?" on WEB-42 → Sam gets the email', async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { project, issue, issueRef } = await website();

  const posted = await comment(issueRef, alex, `@${sam.username} can you check?`);

  expect(await notificationsFor(sam)).toEqual([
    expect.objectContaining({
      targetType: "issue",
      targetId: issue.id,
      waitSeconds: 120,
      kind: "mentioned",
      actorId: alex.id,
      commentId: posted.id,
      issueRef,
      issueTitle: "Fix login button",
      projectName: "Website",
      projectKey: project.key,
      linkPath: `/issue/${issueRef}#comment-${posted.id}`,
      excerpt: `@${sam.username} can you check?`,
    }),
  ]);
});

it("REQ-044.3: Alex edits a comment that already mentions @sam and adds @jo → only Jo is emailed", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const jo = await createMember();
  const { issueRef } = await website();
  const posted = await comment(issueRef, alex, `@${sam.username} look`);

  await editComment(alex, posted.id, { body: `@${sam.username} @${jo.username} look`, version: 0 });

  expect(await notificationsFor(sam)).toHaveLength(1);
  expect(await notificationsFor(jo)).toMatchObject([{ kind: "mentioned", commentId: posted.id }]);
});

it("REQ-044.4: One comment mentions @sam twice → Sam gets one email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();

  await comment(issueRef, alex, `@${sam.username} and again @${sam.username}`);

  expect(await notificationsFor(sam)).toHaveLength(1);
});

it("REQ-044.5: Alex mentions @sam in a comment on project WEB → the email links to the WEB project details page", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const project = await createProject({ name: "Website" });

  const { comment: posted } = await postProjectComment(alex, project.key, {
    requestId: randomUUID(),
    body: `@${sam.username} thoughts?`,
  });

  expect(await notificationsFor(sam)).toEqual([
    expect.objectContaining({
      targetType: "project",
      targetId: project.id,
      kind: "mentioned",
      commentId: posted.id,
      issueRef: null,
      issueTitle: null,
      projectName: "Website",
      projectKey: project.key,
      linkPath: `/project/${project.key}/detail#comment-${posted.id}`,
      excerpt: `@${sam.username} thoughts?`,
    }),
  ]);
});

it("REQ-044.6: Alex mentions @sam in the WEB project description → Sam gets the email, linking to the WEB project details page", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const project = await createProject({ name: "Website" });

  await updateProject(alex, project.key, {
    description: `Owner: @${sam.username}`,
    descriptionVersion: 0,
  });

  expect(await notificationsFor(sam)).toEqual([
    expect.objectContaining({
      targetType: "project",
      targetId: project.id,
      kind: "mentioned",
      commentId: null,
      projectName: "Website",
      projectKey: project.key,
      linkPath: `/project/${project.key}/detail`,
      excerpt: `Owner: @${sam.username}`,
    }),
  ]);
});

it("REQ-044: a mention in an issue description emails the member, linking to the issue", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issue, issueRef } = await website();

  await updateIssue(alex, issueRef, { description: `Ask @${sam.username}`, descriptionVersion: 0 });

  expect(await notificationsFor(sam)).toEqual([
    expect.objectContaining({
      targetType: "issue",
      targetId: issue.id,
      kind: "mentioned",
      commentId: null,
      issueRef,
      linkPath: `/issue/${issueRef}`,
      excerpt: `Ask @${sam.username}`,
    }),
  ]);
});

it("REQ-044.7: Alex mentions @sam in a comment, edits the mention out, then adds it back → Sam gets a second email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  const posted = await comment(issueRef, alex, `@${sam.username} look`);

  await editComment(alex, posted.id, { body: "look", version: 0 });
  await editComment(alex, posted.id, { body: `@${sam.username} look again`, version: 1 });

  expect((await notificationsFor(sam)).map((row) => row.excerpt)).toEqual([
    `@${sam.username} look`,
    `@${sam.username} look again`,
  ]);
});

it("REQ-044: the excerpt is plain text with whitespace collapsed, cut at 500 characters with …", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();
  const body = `**Hey** @${sam.username}\n\n\nsee   \`the code\`\n\n${"x".repeat(600)}`;

  await comment(issueRef, alex, body);

  const plain = `Hey @${sam.username} see the code ${"x".repeat(600)}`;
  const [{ excerpt }] = await notificationsFor(sam);
  expect(excerpt).toBe(`${plain.slice(0, 500)}…`);
});

it("REQ-045.1, §2.6: Alex assigns WEB-42 to Sam and mentions @sam in a comment on it → one email covering both, with no extra delivery", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();

  await assign(issueRef, alex, sam);
  await comment(issueRef, alex, `@${sam.username} over to you`);

  const rows = await notificationsFor(sam);
  expect(rows.map((row) => row.kind)).toEqual(["assigned", "mentioned"]);
  expect(new Set(rows.map((row) => row.batchId)).size).toBe(1);
  expect(await deliveriesFor(sam)).toHaveLength(1);
});

it("REQ-045.8: a mention during the wait joins the email without moving send after; one after it starts a new email", async () => {
  const alex = await createMember();
  const sam = await createMember();
  const { issueRef } = await website();

  await comment(issueRef, alex, `@${sam.username} first`);
  const [{ batchId: firstBatch }] = await notificationsFor(sam);
  await moveIntoPast(notificationBatches.sendAfter, firstBatch, "-30 seconds");
  const [{ sendAfter: before }] = await db
    .select({ sendAfter: notificationBatches.sendAfter })
    .from(notificationBatches)
    .where(eq(notificationBatches.id, firstBatch));

  await comment(issueRef, alex, `@${sam.username} second`);
  const [{ sendAfter: after }] = await db
    .select({ sendAfter: notificationBatches.sendAfter })
    .from(notificationBatches)
    .where(eq(notificationBatches.id, firstBatch));
  expect(after).toEqual(before);

  await moveIntoPast(notificationBatches.sendAfter, firstBatch, "30 seconds");
  await comment(issueRef, alex, `@${sam.username} third`);

  const rows = await notificationsFor(sam);
  expect(rows.map((row) => [row.excerpt.split(" ")[1], row.batchId === firstBatch])).toEqual([
    ["first", true],
    ["second", true],
    ["third", false],
  ]);
  expect(rows[2].waitSeconds).toBe(120);
});

it("§2.6: a member must keep at least one notification channel", async () => {
  const sam = await createMember();

  const error = await db
    .update(members)
    .set({ notificationChannels: [] })
    .where(eq(members.id, sam.id))
    .catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(DrizzleQueryError);
  expect((error as DrizzleQueryError).cause).toMatchObject({
    constraint_name: "members_notification_channels_not_empty",
  });
});