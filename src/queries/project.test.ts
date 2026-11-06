import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { DomainError } from "../domain/shared/domain-error";
import { ProjectKey, tryFrom } from "../domain/shared/identifiers";
import { db } from "../infrastructure/db";
import { issues } from "../infrastructure/issues/tables";
import { createIssue, createMember, createProject } from "../test/factories";
import { getProject } from "./project";

it("REQ-046.3: the details count the project's issues in every status and leave out other projects' issues", async () => {
  const member = await createMember();
  const web = await createProject();
  const api = await createProject();
  const statuses = ["backlog", "backlog", "backlog", "in_progress", "done", "done"] as const;
  for (const status of statuses) {
    const issue = await createIssue(web.id);
    await db.update(issues).set({ status }).where(eq(issues.id, issue.id));
  }
  await createIssue(api.id);

  const details = await getProject(member, ProjectKey.from(web.key));

  expect(details.issueCounts).toEqual({ backlog: 3, in_progress: 1, in_review: 0, done: 2, canceled: 0 });
});

it("REQ-046.4: the details name when and by whom the project was created, or only when for a project with no recorded creator", async () => {
  const member = await createMember();
  const alex = await createMember({ fullName: "Alex Kim", role: "admin" });
  const created = await createProject({ createdBy: alex.id });
  const older = await createProject();

  expect(await getProject(member, ProjectKey.from(created.key))).toMatchObject({
    createdAt: created.createdAt.toISOString(),
    createdBy: { username: alex.username, fullName: "Alex Kim", initials: "AK", deactivated: false },
  });
  expect((await getProject(member, ProjectKey.from(older.key))).createdBy).toBeNull();
});

it("STD-4: an unknown or malformed key is Not found", async () => {
  const member = await createMember();

  for (const key of ["NOPE", "no such key"]) {
    await expect(getProject(member, tryFrom(ProjectKey, key))).rejects.toEqual(
      new DomainError("notFound", "Not found"),
    );
  }
});