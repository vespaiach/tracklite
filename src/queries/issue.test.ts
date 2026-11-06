import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { IssueId } from "../domain/shared/identifiers";
import { comments } from "../infrastructure/comments/tables";
import { db } from "../infrastructure/db";
import { issues } from "../infrastructure/issues/tables";
import { projects } from "../infrastructure/projects/tables";
import { createComment, createIssue, createLabel, createMember, createProject } from "../test/factories";
import { moveIntoPast } from "../test/time";
import { findIssueById, listIssueComments } from "./index";

async function issueIn(project: { id: string; key: string }, labelIds: string[] = []) {
  const issue = await createIssue(project.id, labelIds);
  return { ...issue, displayId: IssueId.from(`${project.key}-${issue.number}`) };
}

it("REQ-020, REQ-013.1: an issue has its labels sorted by name, descriptionVersion and mentions; in an archived project it still opens, marked archived", async () => {
  const member = await createMember();
  const project = await createProject();
  const frontend = await createLabel(project.id, { name: "frontend", color: "blue" });
  const bug = await createLabel(project.id, { name: "Bug", color: "red" });
  const issue = await issueIn(project, [frontend.id, bug.id]);

  expect(await findIssueById(member, issue.displayId)).toMatchObject({
    id: `${project.key}-${issue.number}`,
    labels: [
      { id: bug.id, name: "Bug", color: "red" },
      { id: frontend.id, name: "frontend", color: "blue" },
    ],
    descriptionVersion: 0,
    mentions: [],
    archived: false,
  });

  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  expect(await findIssueById(member, issue.displayId)).toMatchObject({ archived: true });
});

it("REQ-032.1: comments posted at 09:00 and 09:05 → the 09:00 comment is first", async () => {
  const author = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  const later = await createComment({ issueId: issue.id }, author.id, "09:05");
  const earlier = await createComment({ issueId: issue.id }, author.id, "09:00");
  await moveIntoPast(comments.createdAt, later.id, "1 hour");
  await moveIntoPast(comments.createdAt, earlier.id, "1 hour 5 minutes");

  const thread = await listIssueComments(author, issue.displayId);

  expect(thread.map((comment) => comment.body)).toEqual(["09:00", "09:05"]);
});

it("REQ-032.4: WEB-42 has 200 comments → all 200 are listed", async () => {
  const author = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.insert(comments).values(
    Array.from({ length: 200 }, (_, index) => ({
      issueId: issue.id,
      authorId: author.id,
      body: `Comment ${index}`,
      requestId: randomUUID(),
    })),
  );

  expect(await listIssueComments(author, issue.displayId)).toHaveLength(200);
});

it("REQ-032.3: an archived project's issue thread still lists", async () => {
  const author = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  await createComment({ issueId: issue.id }, author.id, "Before archiving");
  await db.update(projects).set({ archivedAt: sql`now()` }).where(eq(projects.id, project.id));

  const thread = await listIssueComments(author, issue.displayId);

  expect(thread.map((comment) => comment.body)).toEqual(["Before archiving"]);
});

it("listing a deleted issue's comments gets Not found", async () => {
  const member = await createMember();
  const project = await createProject();
  const issue = await issueIn(project);
  await db.delete(issues).where(eq(issues.id, issue.id));

  await expect(listIssueComments(member, issue.displayId)).rejects.toThrow("Not found");
});