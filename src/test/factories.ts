import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { db } from "../server/db";
import { issueLabels, issues, labels, members, projectKeys, projects } from "../server/schema";

type NewMember = typeof members.$inferInsert;
type NewProject = typeof projects.$inferInsert;
type NewLabel = typeof labels.$inferInsert;

export async function createMember(overrides: Partial<NewMember> = {}) {
  const suffix = randomBytes(5).toString("hex");
  const [member] = await db
    .insert(members)
    .values({
      email: `member-${suffix}@example.test`,
      fullName: `Member ${suffix}`,
      username: `m-${suffix}`,
      passwordHash: "not-a-real-hash",
      role: "member",
      ...overrides,
    })
    .returning();
  return member;
}

export function uniqueProjectKey() {
  return Array.from({ length: 5 }, () => String.fromCharCode(65 + randomInt(26))).join("");
}

export async function createProject(overrides: Partial<NewProject> = {}) {
  const key = overrides.key ?? uniqueProjectKey();
  await db.insert(projectKeys).values({ key });
  const [project] = await db
    .insert(projects)
    .values({ name: `Project ${key}`, ...overrides, key })
    .returning();
  return project;
}

export async function createLabel(projectId: string, overrides: Partial<NewLabel> = {}) {
  const [label] = await db
    .insert(labels)
    .values({ name: `label-${randomBytes(4).toString("hex")}`, color: "gray", ...overrides, projectId })
    .returning();
  return label;
}

let nextIssueNumber = 1;

export async function createIssue(projectId: string, labelIds: string[] = []) {
  const creator = await createMember();
  const number = nextIssueNumber++;
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
  if (labelIds.length > 0) {
    await db.insert(issueLabels).values(labelIds.map((labelId) => ({ issueId: issue.id, labelId })));
  }
  return issue;
}