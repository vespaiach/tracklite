import { randomBytes, randomInt } from "node:crypto";
import { db } from "../server/db";
import { members, projectKeys, projects } from "../server/schema";

type NewMember = typeof members.$inferInsert;
type NewProject = typeof projects.$inferInsert;

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